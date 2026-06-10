import { Migration } from '@beeblock/svelar/database';

export default class CreateUsersTable extends Migration {
  async up() {
    await this.schema.createTable('users', (table) => {
      table.id();
      table.string('name');
      table.string('email').unique();
      table.string('password');
      table.timestamp('email_verified_at').nullable();
      table.timestamps();
    });
  }

  async down() {
    await this.schema.dropTable('users');
  }
}
