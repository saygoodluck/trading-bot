'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('trade_position', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      type: {
        type: Sequelize.ENUM('long', 'short'),
        allowNull: false
      },
      state: {
        type: Sequelize.ENUM('pending', 'open', 'closed'),
        allowNull: false
      },
      symbol: {
        type: Sequelize.STRING,
        allowNull: false
      },
      entryPrice: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      closePrice: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      size: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      openedAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      closedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      index: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      sl: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      tp: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      rr: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      entryReason: {
        type: Sequelize.STRING,
        allowNull: true
      },
      exitReason: {
        type: Sequelize.STRING,
        allowNull: true
      },
      pnlAbs: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      pnlPct: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      duration: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('trade_position');
  }
};
