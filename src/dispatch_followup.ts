export type VisibilitySnapshot = {
  deadLetters: number;
  failedRuns: number;
  errorGroups: number;
};

export type Followup = {
  dispatchStatus: "on_track" | "dispatch_review" | "technician_call";
  reason: string;
};

/** Turn queue and scheduler evidence into the next concrete field-service action. */
export function chooseFollowup(snapshot: VisibilitySnapshot): Followup {
  if (snapshot.deadLetters > 0) {
    return {
      dispatchStatus: "technician_call",
      reason: "A photo handoff is in the dead-letter list, so call the assigned technician.",
    };
  }
  if (snapshot.failedRuns > 0 || snapshot.errorGroups > 0) {
    return {
      dispatchStatus: "dispatch_review",
      reason: "The background photo check needs a dispatcher review.",
    };
  }
  return { dispatchStatus: "on_track", reason: "Photo handoff and scheduled checks are clear." };
}
