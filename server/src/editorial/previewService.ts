import { editorialRepo, GameweekPreviewRow } from "./repo";
import { gatherGameweekPreviewFacts } from "./previewData";
import { generatePreviewCopy } from "./previewGenerator";

/**
 * Generates (or regenerates) the draft for the upcoming round. If a
 * still-unpublished draft already exists for that round, it's replaced in
 * place — repeated admin "Regenerate" clicks before publishing don't pile up
 * rows. A round that's already PUBLISHED gets a fresh DRAFT sibling instead,
 * so the live piece stays up until an admin deliberately re-publishes.
 */
export async function generateGameweekPreview(): Promise<GameweekPreviewRow> {
  const facts = gatherGameweekPreviewFacts();
  const copy = await generatePreviewCopy(facts);

  const existing = editorialRepo.getLatestForRound(facts.round);
  if (existing && existing.status === "DRAFT") {
    editorialRepo.regenerateInPlace(existing.id, { headline: copy.headline, body: copy.body, facts });
    return editorialRepo.getById(existing.id)!;
  }
  return editorialRepo.insertDraft({ round: facts.round, headline: copy.headline, body: copy.body, facts });
}
