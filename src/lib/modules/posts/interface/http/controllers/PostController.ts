import { Controller } from '@beeblock/svelar/routing';
import { CreatePostRequest } from '$lib/modules/posts/interface/http/requests/CreatePostRequest.js';
import { UpdatePostRequest } from '$lib/modules/posts/interface/http/requests/UpdatePostRequest.js';
import { PostService } from '$lib/modules/posts/application/services/PostService.js';
import { CreatePostAction } from '$lib/modules/posts/application/actions/CreatePostAction.js';
import { PostResource } from '$lib/modules/posts/interface/http/resources/PostResource.js';

const postService = new PostService();
const createPostAction = new CreatePostAction();

export class PostController extends Controller {
  /** GET /api/posts */
  async index(event: any) {
    const showAll = event.url.searchParams.get('all') === 'true';

    if (showAll && event.locals.user) {
      const posts = await postService.findAll();
      return PostResource.collection(posts).toResponse();
    }

    const posts = await postService.findPublished();
    return PostResource.collection(posts).toResponse();
  }

  /** GET /api/posts/:id */
  async show(event: any) {
    const post = await postService.findByIdOrFail(event.params.id);
    return PostResource.make(post).toResponse();
  }

  /** POST /api/posts */
  async store(event: any) {
    const data = await CreatePostRequest.validate(event);
    const userId = event.locals.user?.id;

    if (!userId) {
      return this.json({ message: 'Unauthenticated' }, 401);
    }

    const post = await createPostAction.run({
      userId,
      title: data.title,
      slug: data.slug,
      body: data.body,
      published: data.published,
    });

    return PostResource.make(post).status(201).toResponse();
  }

  /** PUT /api/posts/:id */
  async update(event: any) {
    const data = await UpdatePostRequest.validate(event);
    const post = await postService.update(event.params.id, data);
    return PostResource.make(post).toResponse();
  }

  /** DELETE /api/posts/:id */
  async destroy(event: any) {
    await postService.delete(event.params.id);
    return this.noContent();
  }

  /** GET /api/posts/mine */
  async mine(event: any) {
    const userId = event.locals.user?.id;
    if (!userId) {
      return this.json({ message: 'Unauthenticated' }, 401);
    }

    const posts = await postService.findByUser(userId);
    return PostResource.collection(posts).toResponse();
  }
}
