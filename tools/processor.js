require('dotenv').config(); // Load environment variables from .env
const { Client } = require('pg'); // PostgreSQL client
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const ldap = require('ldapjs');

// Encryption setup
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Key from environment variable (must be 32 bytes)
const IV_LENGTH = 16; // AES requires a 16-byte IV

// Function to encrypt a password
function encryptPassword(password) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(password);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

// Function to decrypt a password
function decryptPassword(encrypted) {
    const [iv, content] = encrypted.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(Buffer.from(content, 'hex'));
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

// Function to generate SSHA password
function generateSSHA(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.createHash('sha1').update(Buffer.concat([Buffer.from(password), salt])).digest();
    const ssha = Buffer.concat([hash, salt]);
    return `{SSHA}${ssha.toString('base64')}`;
}

// LDAP setup
const LDAP_URL = process.env.LDAP_URL;
const LDAP_BIND_DN = process.env.LDAP_BIND_DN;
const LDAP_BIND_PASSWORD = process.env.LDAP_BIND_PASSWORD;

// PostgreSQL client setup
const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT, 10),
});

// Function to delete an LDAP user
async function deleteLDAPUser(ldapClient, uid) {
    return new Promise((resolve, reject) => {
        ldapClient.del(`uid=${uid},ou=users,dc=example,dc=com`, (err) => {
            if (err && err.name !== 'NoSuchObjectError') {
                return reject(`Failed to delete LDAP user ${uid}: ${err}`);
            }
            console.log(`Deleted LDAP user ${uid}`);
            resolve();
        });
    });
}

// Function to insert data into the validator table and LDAP
async function insertValidators() {
    const ldapClient = ldap.createClient({ url: LDAP_URL });

    try {
        // Bind LDAP client
        await new Promise((resolve, reject) => {
            ldapClient.bind(LDAP_BIND_DN, LDAP_BIND_PASSWORD, (err) => {
                if (err) {
                    console.error(`LDAP bind error: ${err}`);
                    return reject(`LDAP bind error: ${err}`);
                }
                resolve();
            });
        });

        // Connect to PostgreSQL
        await client.connect();

        // Check for signers and insert into validator table
        const res = await client.query('SELECT signer_address FROM signers');
        const addresses = res.rows.map(row => row.signer_address);

        // Prepare to write decrypted passwords to a file
        const decryptedPasswords = [];

        for (const address of addresses) {
            // Generate a unique UUID password for each address
            const uuidPassword = uuidv4().replace(/-/g, '');
            const encryptedPassword = encryptPassword(uuidPassword);
            const sshaPassword = generateSSHA(uuidPassword);

            // Check if the address already exists in the validator table
            const existsRes = await client.query('SELECT COUNT(*) FROM validator WHERE address = $1', [address]);
            const exists = parseInt(existsRes.rows[0].count, 10);

            if (exists === 0) {
                // Insert new address and encrypted password into the validator table
                await client.query('INSERT INTO validator (address, encrypted_password) VALUES ($1, $2)', [address, encryptedPassword]);
                console.log(`Inserted ${address} into validator table with encrypted password.`);

                // Collect decrypted password for output
                decryptedPasswords.push({ address, password: uuidPassword });

                // Delete user from LDAP if exists
                try {
                    await deleteLDAPUser(ldapClient, address);
                } catch (err) {
                    console.error(err);
                }

                // Add user to LDAP
                await new Promise((resolve, reject) => {
                    const entry = {
                        cn: address,
                        sn: address,
                        uid: address,
                        userPassword: sshaPassword,
                        objectClass: ['inetOrgPerson', 'organizationalPerson', 'person', 'top'],
                    };

                    ldapClient.add(`uid=${address},ou=users,dc=example,dc=com`, entry, (err) => {
                        if (err) {
                            console.error(`Failed to add LDAP user ${address}: ${err}`);
                            return reject(`Failed to add LDAP user ${address}: ${err}`);
                        }
                        console.log(`Added LDAP user ${address}`);
                        resolve();
                    });
                });

            } else {
                console.log(`${address} already exists in the validator table.`);
            }
        }

        // Write decrypted passwords to a file
        fs.writeFileSync('decrypted_passwords.json', JSON.stringify(decryptedPasswords, null, 2));
        console.log('Decrypted passwords have been written to decrypted_passwords.json.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        // Close PostgreSQL connection
        try {
            await client.end();
        } catch (err) {
            console.error('PostgreSQL client end error:', err);
        }

        // Unbind LDAP client
        ldapClient.unbind((err) => {
            if (err) {
                console.error('LDAP unbind error:', err);
            }
        });
    }
}

// Execute the insertion
insertValidators();
