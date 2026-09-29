import { transcribe, gateway } from "ai";
import {
  authorizeFarm,
  requirePlan,
  AccessError,
  apiError,
} from "@/src/lib/access-server";
export const runtime = "nodejs";
export const maxDuration = 45;
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 4_000_000)
      throw new AccessError(
        "Recording is too large. Keep it under two minutes.",
        413,
      );
    const form = await request.formData();
    const file = form.get("audio");
    const farmId = String(form.get("farmId") ?? "");
    const { supabase } = await authorizeFarm(farmId);
    await requirePlan(supabase, farmId);
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 3_500_000 ||
      !/^(audio\/(webm|mp4|mpeg|wav|ogg|x-m4a|x-wav|flac)|video\/webm)/.test(
        file.type,
      )
    )
      throw new AccessError("Use a supported audio file under 3.5 MB.", 400);
    const { data: allowed, error } = await supabase.rpc(
      "consume_record_ai_request",
      { p_farm_id: farmId },
    );
    if (error)
      throw new AccessError("Voice service is not configured yet.", 503);
    if (!allowed)
      throw new AccessError(
        "Hourly voice limit reached. Type your note instead.",
        429,
      );
    const result = await transcribe({
      model: gateway.transcription(
        process.env.FARMVOICE_TRANSCRIPTION_MODEL ||
          "openai/gpt-4o-mini-transcribe",
      ),
      audio: await file.arrayBuffer(),
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(35000),
    });
    return Response.json({ text: result.text });
  } catch (error) {
    return apiError(error);
  }
}
