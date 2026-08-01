import { FormRequest } from '@beeblock/svelar/forms';
import { AgentLoopDto } from '$lib/modules/agent-room/application/dto/AgentRoomDtos.js';
import { agentLoopSchema } from '$lib/modules/agent-room/contracts/schemas/schemas.js';

export class AgentLoopRequest extends FormRequest {
  rules() {
    return agentLoopSchema;
  }

  authorize(): boolean {
    return true;
  }

  passedValidation(data: unknown): AgentLoopDto {
    return AgentLoopDto.from(agentLoopSchema.parse(data));
  }
}
