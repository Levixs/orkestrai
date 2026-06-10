import { Migration } from '@beeblock/svelar/database';

export default class AddRoleToUsers extends Migration {
  async up() {
    await this.schema.table('users', (table) => {
      table.string('role').default('user');
    });
  }

  async down() {
    await this.schema.table('users', (table) => {
      table.dropColumn('role');
    });
  }
}
