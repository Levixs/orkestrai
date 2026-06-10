import { describe, it, expect } from 'vitest';
import { useSvelarTest, assertDatabaseHas } from '@beeblock/svelar/testing';
// import UserFactory from '$lib/factories/UserFactory';

describe('Auth Feature Test', () => {
  useSvelarTest({ refreshDatabase: true });

  it('should set up the test database', async () => {
    // The database is automatically refreshed before each test
    // when refreshDatabase: true is set in useSvelarTest().
    expect(true).toBe(true);
  });

  // Uncomment once you have a UserFactory:
  // it('should create a user via factory', async () => {
  //   const user = await UserFactory.create({ name: 'Alice' });
  //   await assertDatabaseHas('users', { name: 'Alice' });
  // });
});
