import { env } from "cloudflare:workers";
import { D1RoomRepository, handleRoomRequest, readRoomRequest, RoomError } from "../../../lib/rooms.ts";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      throw new RoomError(403, "Requests must originate from this site.");
    }
    const input = await readRoomRequest(request);
    if (!env.DB) throw new RoomError(503, "Multiplayer storage is unavailable. Local play is available.");
    const result = await handleRoomRequest(new D1RoomRepository(env.DB), input);
    return Response.json(result, { status: input.op === "create" ? 201 : 200, headers });
  } catch (error) {
    const known = error instanceof RoomError;
    // Never emit payloads, SQL, room codes, hashes or player tokens in errors/logs.
    return Response.json(
      { error: known ? error.message : "Room service is temporarily unavailable. Retry shortly." },
      { status: known ? error.status : 503, headers },
    );
  }
}
