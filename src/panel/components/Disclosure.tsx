import type * as React from "react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { S } from "../styles";
import DisclosureCaret from "./DisclosureCaret";

// The one shared trailing-summary style: muted small text pushed to the
// trailing edge of the header row.
const SUMMARY: CSSProperties = {
	...S.sectionCount,
	marginLeft: "auto",
};

interface Props {
	/** id of the body element, wired to the header button's aria-controls. */
	id: string;
	/** Header label, rendered after the caret. */
	label: React.ReactNode;
	/** Optional trailing summary, pushed to the trailing edge of the header. */
	summary?: React.ReactNode;
	/** Header button style. Defaults to the borderless S.disclosureToggle. */
	headerStyle?: CSSProperties;
	/** Body style while open. Defaults to S.disclosureBody. */
	bodyStyle?: CSSProperties;
	/**
	 * Body mount strategy. false (the default) mounts the body once and toggles
	 * the `hidden` attribute, so the aria-controls target is always the real
	 * body. true mounts the children only while open, keeping an empty hidden
	 * placeholder as the aria-controls target; use it where the children are
	 * expensive (e.g. a section of conversion cards).
	 */
	lazy?: boolean;
	/** Initial state for the uncontrolled mode. Ignored when `open` is set. */
	defaultOpen?: boolean;
	/** Controlled mode: pair with onToggle. */
	open?: boolean;
	onToggle?: () => void;
	children: React.ReactNode;
}

/**
 * The shared caret-toggle disclosure row: a header button (caret, label,
 * optional trailing summary) wired via aria-expanded and aria-controls to a
 * body. Renders a fragment so each call site keeps its own card or section
 * wrapper element.
 */
export default function Disclosure({
	id,
	label,
	summary,
	headerStyle = S.disclosureToggle,
	bodyStyle = S.disclosureBody,
	lazy = false,
	defaultOpen = false,
	open: openProp,
	onToggle,
	children,
}: Props): React.ReactElement {
	const [localOpen, setLocalOpen] = useState(defaultOpen);
	const open = openProp ?? localOpen;
	const toggle = onToggle ?? ((): void => setLocalOpen((o) => !o));
	return (
		<>
			<button
				type="button"
				style={headerStyle}
				aria-expanded={open}
				aria-controls={id}
				onClick={toggle}
			>
				<DisclosureCaret expanded={open} />
				{label}
				{summary != null ? <span style={SUMMARY}>{summary}</span> : null}
			</button>
			{lazy ? (
				open ? (
					<div id={id} style={bodyStyle}>
						{children}
					</div>
				) : (
					// Placeholder keeps the header's aria-controls target present
					// while collapsed and the children are unmounted.
					<div id={id} hidden />
				)
			) : (
				<div id={id} style={bodyStyle} hidden={!open}>
					{children}
				</div>
			)}
		</>
	);
}
