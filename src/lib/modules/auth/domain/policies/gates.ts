import { Gate } from '@beeblock/svelar/auth';

Gate.define('admin-access', (user) => user?.role === 'admin');

Gate.define('edit-post', (user, post) => {
  if (!user) return false;
  return user.id === post.user_id || user.role === 'admin';
});

Gate.define('delete-post', (user, post) => {
  if (!user) return false;
  return user.id === post.user_id || user.role === 'admin';
});

Gate.define('manage-users', (user) => user?.role === 'admin');

Gate.defineSuperUser((user) => user?.role === 'admin');
