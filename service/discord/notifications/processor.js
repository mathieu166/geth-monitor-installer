const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize('database', 'username', 'password', {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    logging: false, // Disable Sequelize logging
});

module.exports = (discordClient) => {
}