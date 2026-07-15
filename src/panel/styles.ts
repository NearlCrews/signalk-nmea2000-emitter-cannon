import type { CSSProperties } from "react";
import { ACTION_STYLES } from "./sharedStyles/actionStyles";
import { DISCLOSURE_STYLES } from "./sharedStyles/disclosureStyles";
import { FEEDBACK_STYLES } from "./sharedStyles/feedbackStyles";
import { FORM_STYLES } from "./sharedStyles/formStyles";
import { FOUNDATION_STYLES } from "./sharedStyles/foundationStyles";

/** Shared style facade kept stable for panel components. */
export const S = {
	...FOUNDATION_STYLES,
	...FORM_STYLES,
	...ACTION_STYLES,
	...FEEDBACK_STYLES,
	...DISCLOSURE_STYLES,
} satisfies Record<string, CSSProperties>;
