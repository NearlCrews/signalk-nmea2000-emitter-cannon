/**
 * Returns true when the Save button should be disabled.
 *
 * Save is disabled when there are no pending edits AND the plugin is already
 * configured. It stays enabled when the plugin is unconfigured (configuration
 * prop is null or undefined on first install) so the user can save defaults
 * and allow the plugin to start.
 */
export function isSaveDisabled(dirty: boolean, unconfigured: boolean): boolean {
	return !dirty && !unconfigured;
}
