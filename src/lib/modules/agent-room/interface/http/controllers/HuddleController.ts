import { Controller, type RequestEvent } from '@beeblock/svelar/routing';
import { CreateHuddleDto, CreateHuddleTaskDto, SubmitHuddleTurnDto, UpdateHuddleDto } from '../../../application/dto/HuddleDtos.js';
import { huddleService } from '../../../application/services/HuddleService.js';
import { CreateHuddleRequest } from '../requests/CreateHuddleRequest.js';
import { CreateHuddleTaskRequest } from '../requests/CreateHuddleTaskRequest.js';
import { SubmitHuddleTurnRequest } from '../requests/SubmitHuddleTurnRequest.js';
import { UpdateHuddleRequest } from '../requests/UpdateHuddleRequest.js';
import { settingsService } from '../../../application/services/SettingsService.js';

async function localActor() {
  const locale = await settingsService.get('uiLanguage');
  const name = locale === 'pt-BR' ? 'Você' : locale === 'es' ? 'Tú' : 'You';
  return { kind: 'user' as const, id: 'local-user', name };
}

export class HuddleController extends Controller {
  async index(event: RequestEvent) {
    try {
      return this.json({ data: await huddleService.snapshot(event.params.id, event.url.searchParams.get('selected')) });
    } catch (error) {
      return this.failure(error, 'Could not load huddles.');
    }
  }

  async store(event: RequestEvent) {
    try {
      const input = await CreateHuddleRequest.validate(event);
      return this.json({ data: await huddleService.create(event.params.id, CreateHuddleDto.from(input), await localActor()) }, 201);
    } catch (error) {
      return this.failure(error, 'Could not start the huddle.');
    }
  }

  async show(event: RequestEvent) {
    try {
      return this.json({ data: (await huddleService.snapshot(event.params.id, event.params.huddleId)).selected });
    } catch (error) {
      return this.failure(error, 'Huddle not found.', 404);
    }
  }

  async update(event: RequestEvent) {
    try {
      const input = await UpdateHuddleRequest.validate(event);
      return this.json({ data: await huddleService.update(event.params.id, event.params.huddleId, UpdateHuddleDto.from(input)) });
    } catch (error) {
      return this.failure(error, 'Could not update the huddle.');
    }
  }

  async turn(event: RequestEvent) {
    try {
      const input = await SubmitHuddleTurnRequest.validate(event);
      return this.json({ data: await huddleService.submit(event.params.id, event.params.huddleId, SubmitHuddleTurnDto.from(input), await localActor()) }, 202);
    } catch (error) {
      return this.failure(error, 'Could not send the huddle turn.');
    }
  }

  async task(event: RequestEvent) {
    try {
      const input = await CreateHuddleTaskRequest.validate(event);
      return this.json({ data: await huddleService.createTask(event.params.id, event.params.huddleId, CreateHuddleTaskDto.from(input)) }, 201);
    } catch (error) {
      return this.failure(error, 'Could not create a task from the huddle.');
    }
  }

  private failure(error: unknown, fallback: string, status = 400) {
    return this.json({ error: error instanceof Error ? error.message : fallback }, status);
  }
}
