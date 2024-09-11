require('dotenv').config(); // Load environment variables from .env
const crypto = require('crypto');

// Encryption setup
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Key from environment variable (must be 32 bytes)
const IV_LENGTH = 16; // AES requires a 16-byte IV

// Function to generate a random password
function generatePassword(length) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// Function to encrypt a password
function encryptPassword(password) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(password);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

// Check if ENCRYPTION_KEY is provided
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  console.error('Error: ENCRYPTION_KEY must be provided and must be exactly 32 bytes.');
  process.exit(1); // Exit the script
}

// Get the password argument from the command line (node script.js <password>)
const passwordArg = process.argv[2];
let passwordToEncrypt;

// If a password is passed as an argument, use it; otherwise, generate one
if (passwordArg) {
  passwordToEncrypt = passwordArg;
  console.log('Using provided password:', passwordToEncrypt);
} else {
  passwordToEncrypt = generatePassword(12); // Generate a 12-character random password
  console.log('Generated Password:', passwordToEncrypt);
}

// Encrypt the password
const encryptedPassword = encryptPassword(passwordToEncrypt);
console.log('Encrypted Password:', encryptedPassword);
