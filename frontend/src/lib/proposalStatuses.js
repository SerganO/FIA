export const PROPOSAL_STATUSES = ['draft', 'new', 'under_review', 'approved', 'rejected']

/** Statuses city officials may assign (excludes private drafts). */
export const OFFICIAL_REVIEW_STATUSES = ['new', 'under_review', 'approved', 'rejected']

/** Owner may delete only while in these statuses. */
export const DELETABLE_STATUSES = ['draft', 'new']
