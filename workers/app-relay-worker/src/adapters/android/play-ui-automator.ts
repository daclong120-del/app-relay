// UIAutomator XML Parser & Google Play UI Automation State Machine

export type PlayUiState =
  | 'READY_TO_INSTALL'
  | 'INSTALLING'
  | 'ALREADY_INSTALLED'
  | 'LOGIN_REQUIRED'
  | 'UNSUPPORTED_REGION'
  | 'PAYMENT_REQUIRED'
  | 'UI_UNKNOWN';

export interface UiClickTarget {
  state: PlayUiState;
  x?: number;
  y?: number;
  label?: string;
  errorMessage?: string;
}

export function parseBoundsCenter(boundsStr: string): { x: number; y: number } | null {
  const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return null;

  const left = parseInt(match[1], 10);
  const top = parseInt(match[2], 10);
  const right = parseInt(match[3], 10);
  const bottom = parseInt(match[4], 10);

  return {
    x: Math.floor((left + right) / 2),
    y: Math.floor((top + bottom) / 2),
  };
}

export function parsePlayUiAutomatorXml(xml: string): UiClickTarget {
  if (!xml || !xml.trim()) {
    return { state: 'UI_UNKNOWN', errorMessage: 'UIAutomator XML is empty.' };
  }

  // 1. Check Login Required State
  if (
    xml.includes('text="Sign in"') ||
    xml.includes('content-desc="Sign in"') ||
    xml.includes('text="Sign in to your Google Account"')
  ) {
    return { state: 'LOGIN_REQUIRED', errorMessage: 'PLAY_LOGIN_REQUIRED: Google Play login is required on device.' };
  }

  // 2. Check Unsupported Region State
  if (
    xml.includes("isn't available in your country") ||
    xml.includes('not available in your country') ||
    xml.includes('This item is not available in your country')
  ) {
    return { state: 'UNSUPPORTED_REGION', errorMessage: 'UNSUPPORTED_REGION: App is not available in the device region.' };
  }

  // 3. Check Payment Required State
  if (
    xml.includes('text="Buy"') ||
    xml.includes('text="Purchase"') ||
    xml.includes('Payment methods')
  ) {
    return { state: 'PAYMENT_REQUIRED', errorMessage: 'PAYMENT_OR_APPROVAL_REQUIRED: Paid app or purchase approval required.' };
  }

  // Helper regex to extract node attributes
  const nodeRegex = /<node\s+([^>]+)\/?>/gi;
  let match: RegExpExecArray | null;

  let installTarget: UiClickTarget | null = null;
  let openTarget: UiClickTarget | null = null;
  let isInstalling = false;

  while ((match = nodeRegex.exec(xml)) !== null) {
    const attrsStr = match[1];

    const textMatch = attrsStr.match(/text=["']([^"']*)["']/i);
    const descMatch = attrsStr.match(/content-desc=["']([^"']*)["']/i);
    const boundsMatch = attrsStr.match(/bounds=["']([^"']*)["']/i);

    const text = (textMatch ? textMatch[1] : '').trim();
    const desc = (descMatch ? descMatch[1] : '').trim();
    const bounds = boundsMatch ? boundsMatch[1] : '';

    const label = text || desc;
    if (!label) continue;

    // Check Install Button
    if (/^Install$/i.test(label) || /^Get$/i.test(label)) {
      const center = parseBoundsCenter(bounds);
      if (center) {
        installTarget = {
          state: 'READY_TO_INSTALL',
          x: center.x,
          y: center.y,
          label,
        };
      }
    }

    // Check Open / Play Button
    if (/^Open$/i.test(label) || /^Play$/i.test(label)) {
      const center = parseBoundsCenter(bounds);
      if (center) {
        openTarget = {
          state: 'ALREADY_INSTALLED',
          x: center.x,
          y: center.y,
          label,
        };
      }
    }

    // Check Installing / Progress Indicator
    if (
      /^Cancel$/i.test(label) ||
      label.includes('Installing') ||
      label.includes('Downloading') ||
      label.includes('Verifying')
    ) {
      isInstalling = true;
    }
  }

  if (installTarget) return installTarget;
  if (isInstalling) return { state: 'INSTALLING' };
  if (openTarget) return openTarget;

  return { state: 'UI_UNKNOWN', errorMessage: 'PLAY_UI_CHANGED: Unable to locate Play Store action buttons.' };
}
