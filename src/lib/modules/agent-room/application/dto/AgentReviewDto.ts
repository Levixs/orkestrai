import type {
  CreateAgentReviewCommentInput,
  CreateAgentReviewInput,
  DecideAgentReviewInput,
  ReviewCommentSide,
  ReviewStatus,
} from '../../contracts/schemas/review-schemas.schema.js';

export class CreateAgentReviewDto {
  constructor(
    readonly title: string,
    readonly summary: string | null,
    readonly taskId: string | null,
    readonly assigneeNodeId: string | null,
    readonly selectedPaths: string[],
    readonly evidence: string[],
    readonly tests: string[],
    readonly risks: string[],
  ) {}

  static from(input: CreateAgentReviewInput): CreateAgentReviewDto {
    return new CreateAgentReviewDto(
      input.title,
      input.summary ?? null,
      input.taskId ?? null,
      input.assigneeNodeId ?? null,
      input.selectedPaths,
      input.evidence,
      input.tests,
      input.risks,
    );
  }
}

export class DecideAgentReviewDto {
  constructor(readonly status: Exclude<ReviewStatus, 'pending'>, readonly note: string | null) {}

  static from(input: DecideAgentReviewInput): DecideAgentReviewDto {
    return new DecideAgentReviewDto(input.status, input.note ?? null);
  }
}

export class CreateAgentReviewCommentDto {
  constructor(
    readonly filePath: string,
    readonly lineNumber: number | null,
    readonly side: ReviewCommentSide,
    readonly body: string,
    readonly authorNodeId: string | null,
  ) {}

  static from(input: CreateAgentReviewCommentInput): CreateAgentReviewCommentDto {
    return new CreateAgentReviewCommentDto(
      input.filePath,
      input.lineNumber ?? null,
      input.side,
      input.body,
      input.authorNodeId ?? null,
    );
  }
}
