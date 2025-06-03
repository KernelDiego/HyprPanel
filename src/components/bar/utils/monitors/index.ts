import { Gdk } from 'astal/gtk3';
import { BarLayout, BarLayouts } from 'src/lib/options/types';
import { GdkMonitorService } from 'src/services/display/monitor';
import { MonitorMapping } from './types';
import { JSXElement } from 'src/core/types';

/**
 * Returns the bar layout configuration for a specific monitor
 *
 * @param monitor - Monitor ID number
 * @param layouts - Object containing layout configurations for different monitors
 * @returns BarLayout configuration for the specified monitor, falling back to default if not found
 */
export const getLayoutForMonitor = (monitor: number, layouts: BarLayouts): BarLayout => {
    const matchingKey = Object.keys(layouts).find((key) => key === monitor.toString());
    const wildcard = Object.keys(layouts).find((key) => key === '*');

    if (matchingKey !== undefined) {
        return layouts[matchingKey];
    }

    if (wildcard) {
        return layouts[wildcard];
    }

    return {
        left: ['dashboard', 'workspaces', 'windowtitle'],
        middle: ['media'],
        right: ['volume', 'network', 'bluetooth', 'battery', 'systray', 'clock', 'notifications'],
    };
};

/**
 * Checks if a bar layout configuration is empty
 *
 * @param layout - Bar layout configuration to check
 * @returns boolean indicating if all sections of the layout are empty
 */
export const isLayoutEmpty = (layout: BarLayout): boolean => {
    const isLeftSectionEmpty = !Array.isArray(layout.left) || layout.left.length === 0;
    const isRightSectionEmpty = !Array.isArray(layout.right) || layout.right.length === 0;
    const isMiddleSectionEmpty = !Array.isArray(layout.middle) || layout.middle.length === 0;

    return isLeftSectionEmpty && isRightSectionEmpty && isMiddleSectionEmpty;
};

/**
 * Creates widgets for all available monitors with proper GDK to Hyprland monitor mapping.
 *
 * @param widget - Function that creates a widget for a given monitor index
 * @returns Array of created widgets for all available monitors
 */
export async function forMonitors(
    widget: (monitor: number, hyprlandMonitor?: number) => Promise<JSXElement>,
): Promise<JSXElement[]> {
    const display = Gdk.Display.get_default();
    if (display === null) {
        console.error('[forMonitors] No display available');
        return [];
    }

    const monitorCount = display?.get_n_monitors();
    const gdkMonitorService = GdkMonitorService?.getInstance();
    const monitorMappings: MonitorMapping[] = [];

    if (gdkMonitorService === null) {
        console.error('[forMonitors] GdkMonitorService is not initialized');
        return [];
    }

    for (let gdkMonitorIndex = 0; gdkMonitorIndex < monitorCount; gdkMonitorIndex++) {
        const monitor = display?.get_monitor(gdkMonitorIndex);
        if (monitor === null) {
            console.warn(`[forMonitors] Skipping invalid monitor at index ${gdkMonitorIndex}`);
            continue;
        }

        const refreshRate = monitor?.get_refresh_rate() / 1000; // Convertir a Hz
        const geometry = monitor?.get_geometry();
        const manufacturer = monitor?.get_manufacturer();
        const model = monitor?.get_model();

        // A headless monitor is usually created when a screenshot is taken
        // For create: hyprctl 'output create headless test;'
        // For remove: hyprctl 'output remove test;'

        // Verify if it is headless
        const isHeadless =
            refreshRate < 1 || // Very low refresh rate (like 0.06Hz)
            geometry.width === 0 || // No valid geometry
            geometry.height === 0 || // No valid geometry
            (!manufacturer && !model); // No manufacturer information (for checking)

        const hyprlandId = gdkMonitorService?.mapGdkToHyprland(gdkMonitorIndex);

        if (isHeadless || hyprlandId === undefined || hyprlandId === null) {
            console.log(`[forMonitors] Skipping headless or unmapped monitor at index ${gdkMonitorIndex}`);
            continue;
        }

        monitorMappings.push({
            gdkIndex: gdkMonitorIndex,
            hyprlandId,
        });
    }

    const monitorPromises = monitorMappings.map(async ({ gdkIndex, hyprlandId }) => {
        try {
            return await widget(gdkIndex, hyprlandId);
        } catch (error) {
            console.error(`[forMonitors] Failed to create widget for monitor ${gdkIndex}:`, error);
            return null;
        }
    });
    const widgets = await Promise.all(monitorPromises);

    return widgets.filter((w: JSXElement) => w !== null);
}
