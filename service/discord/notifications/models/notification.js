const { Sequelize, DataTypes } =  require('sequelize');
module.exports = sequelize.define('Notification', {
	userId: {
		type: DataTypes.STRING,
		allowNull: false
	},
	message: {
		type: DataTypes.STRING,
		allowNull: false
	},
	triggered: {
		type: DataTypes.BOOLEAN,
		defaultValue: false
	}
}, {
	tableName: 'notifications', // Ensure the table matches your schema
	timestamps: false // Disable automatic createdAt/updatedAt fields
});