/**
 * Settings for the badge pickup backend.
 *
 * In Apps Script, create a file named "Config" and paste this in,
 * then set your real STAFF_PIN there. Never put the real PIN in this
 * GitHub file — the repo is public.
 */
const CONFIG = {
  EVENT_NAME: 'Double My Sales Bootcamp (CA)',  // header on the fallback Apps Script pages
  BOOTH_TABS: {                                 // sheet tab name -> booth number
    'Check-In Booth 1': 1,
    'Check-In Booth 2': 2,
  },
  HELP_BOOTH: 3,                                // where "not found" people are sent
  PICKUPS_TAB: 'Pickups',
  STAFF_PIN: 'CHANGE_ME',
};
