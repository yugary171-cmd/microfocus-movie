import { ENTITY_ID_MAX_LENGTH } from "@microfocus/contracts";

export function boundSupportField(value: string): string {
  return value.trim().slice(0, ENTITY_ID_MAX_LENGTH);
}

export function buildSupportPacket(input: {
  challengeId?: string;
  dramaId?: string;
  requestId?: string;
}): string {
  const challengeId = boundSupportField(input.challengeId ?? "");
  const dramaId = boundSupportField(input.dramaId ?? "");
  const requestId = boundSupportField(input.requestId ?? "");
  return [
    "广告未到账核验包（请发给客服，不要包含密码、验证码或完整令牌）",
    `challengeId: ${challengeId || "未填写"}`,
    `dramaId: ${dramaId || "未填写"}`,
    `requestId: ${requestId || "未填写"}`
  ].join("\n");
}
