import { CrudService } from '@beeblock/svelar/services';
import { Repository } from '@beeblock/svelar/repositories';
import { Broadcast } from '@beeblock/svelar/broadcasting';
import { PostRepository } from '$lib/modules/posts/infrastructure/repositories/PostRepository.js';
import type { Post } from '$lib/modules/posts/domain/models/Post.js';

const postRepo = new PostRepository();

export class PostService extends CrudService<Post> {
  protected repository(): Repository<Post> {
    return postRepo;
  }

  async findPublished(): Promise<Post[]> {
    return postRepo.findPublished();
  }

  async findByUser(userId: number): Promise<Post[]> {
    return postRepo.findByUser(userId);
  }

  async createForUser(userId: number, data: any): Promise<Post> {
    const post = await postRepo.create({
      ...data,
      user_id: userId,
    });

    // Broadcast post creation to subscribers on the "posts" channel
    try {
      await Broadcast.event('post:created', {
        id: (post as any).id,
        title: (post as any).title,
        userId,
      }).on('posts').send();
    } catch {
      // Broadcasting is best-effort — don't fail post creation
    }

    return post;
  }
}
