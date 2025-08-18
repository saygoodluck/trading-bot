'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('market_order', {
      id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true
      },
      symbol: {
        type: Sequelize.STRING,
        allowNull: false
      },
      type: {
        type: Sequelize.ENUM('market', 'limit'),
        allowNull: false
      },
      side: {
        type: Sequelize.ENUM('buy', 'sell'),
        allowNull: false
      },
      price: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      quantity: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('pending', 'failed', 'filled'),
        allowNull: false
      },
      executedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      success: {
        type: Sequelize.BOOLEAN,
        allowNull: true
      },
      positionId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'trade_position',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        allowNull: false
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('market_order');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_market_order_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_market_order_side";');
  }
};
