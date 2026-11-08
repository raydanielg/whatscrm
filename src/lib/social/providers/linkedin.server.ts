/**
 * LinkedIn publishing provider — Community Management-free member posting
 * (UGC Posts API, `POST /v2/ugcPosts`).
 *
 * Posts as the authenticated member (`urn:li:person:{memberId}`), matching
 * the member-login OAuth flow in oauth.server.ts (w_member_social scope).
 * Organization/company-page posting (w_organization_social, an organization
 * URN, and admin/organization access) is intentionally out of scope — this
 * flow never obtains that grant.
 */
import { resolveToken, type ProviderPublishResult } from "./token.server";

export interface LinkedInPublishInput {
  /** LinkedIn OIDC `sub` — the authenticated member's id, not an organization URN. */
  memberId: string;
  accessTokenCipher: string;
  caption: string;
}

export async function publishToLinkedIn(input: LinkedInPublishInput): Promise<ProviderPublishResult> {
  if (!input.memberId) throw new Error("LinkedIn channel is missing the member id. Reconnect the channel.");
  const token = resolveToken(input.accessTokenCipher);

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: `urn:li:person:${input.memberId}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: input.caption },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 403)
      throw new Error(
        "LinkedIn did not grant post publishing permission for this member. Reconnect and approve w_member_social.",
      );
    throw new Error(`LinkedIn error ${res.status}: ${text.slice(0, 200)}`);
  }
  const id = res.headers.get("x-restli-id") ?? undefined;
  return { externalId: id };
}
