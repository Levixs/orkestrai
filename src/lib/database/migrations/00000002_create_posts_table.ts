import { Migration } from '@beeblock/svelar/database';

export default class CreatePostsTable extends Migration {
  async up() {
    await this.schema.createTable('posts', (table) => {
      table.id();
      table.string('title');
      table.string('slug').unique();
      table.text('body');
      table.boolean('published').default(false);
      table.foreignId('user_id').references('id', 'users');
      table.timestamps();
    });
  }

  async down() {
    await this.schema.dropTable('posts');
  }
}
