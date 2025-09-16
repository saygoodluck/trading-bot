import { Injectable, OnModuleInit } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { SequelizeStorage, Umzug } from 'umzug';
import * as path from 'path';
import { getAbsolutePath } from '../../../utils/path';

@Injectable()
export default class DatabaseService implements OnModuleInit {
  constructor(private readonly sequelize: Sequelize) {}

  public async onModuleInit(): Promise<void> {
    await this.applyMigrations();
  }

  private async applyMigrations(): Promise<void> {
    const migrationsPath = path.resolve(getAbsolutePath(), 'migrations/*.js');
    const umzug = new Umzug({
      migrations: {
        glob: migrationsPath,
        resolve: ({ name, path: migrationPath, context }) => ({
          name,
          up: async () => {
            const migration = await import(migrationPath);
            return migration.up(context, Sequelize);
          },
          down: async () => {
            const migration = await import(migrationPath);
            return migration.down(context, Sequelize);
          },
        }),
      },
      context: this.sequelize.getQueryInterface(),
      storage: new SequelizeStorage({ sequelize: this.sequelize }),
      logger: console,
    });

    await umzug.up();
  }
}
