import { Router } from "express";
import type { Deps } from "../app";

/** GET /media/<id>.mp3: public voice notes for Dial to fetch. Ids are 144 random bits, so no auth. */
export function mediaRouter(deps: Deps) {
  const r = Router();
  r.get("/media/:file", async (req, res, next) => {
    try {
      const id = req.params.file.replace(/\.[^.]*$/, "");
      const media = await deps.repo.getMedia(id);
      if (!media) return res.status(404).json({ ok: false, error: "not found" });
      res
        .status(200)
        .set({
          "Content-Type": media.mime_type,
          "Content-Length": String(media.data.length),
          "Cache-Control": "public, max-age=31536000, immutable",
        })
        .end(media.data);
    } catch (e) {
      next(e);
    }
  });
  return r;
}
