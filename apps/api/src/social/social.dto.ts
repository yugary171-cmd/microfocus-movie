import {
  COMMENT_BODY_MAX_LENGTH,
  ENTITY_ID_MAX_LENGTH,
  MESSAGE_BODY_MAX_LENGTH,
  type CreateCommentRequest,
  type CreateConversationRequest,
  type CreateDirectMessageRequest
} from "@microfocus/contracts";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateCommentDto implements CreateCommentRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(COMMENT_BODY_MAX_LENGTH)
  body!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(ENTITY_ID_MAX_LENGTH)
  parentCommentId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(ENTITY_ID_MAX_LENGTH)
  episodeId?: string;
}

export class CreateConversationDto implements CreateConversationRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(ENTITY_ID_MAX_LENGTH)
  peerUserId!: string;
}

export class CreateDirectMessageDto implements CreateDirectMessageRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(MESSAGE_BODY_MAX_LENGTH)
  body!: string;
}
