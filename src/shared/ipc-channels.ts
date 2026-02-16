export const IPC_CHANNELS = {
  // Shell
  SHELL_SPAWN: 'shell:spawn',
  SHELL_WRITE: 'shell:write',
  SHELL_RESIZE: 'shell:resize',
  SHELL_KILL: 'shell:kill',
  SHELL_DATA: 'shell:data',
  SHELL_EXIT: 'shell:exit',

  // Warnings
  WARNING_CHECK: 'warning:check',
  WARNING_TRIGGERED: 'warning:triggered',
  WARNING_CONFIRM: 'warning:confirm',
  WARNING_CANCEL: 'warning:cancel',

  // Config
  CONFIG_LOAD: 'config:load',
  CONFIG_SAVE: 'config:save',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',

  // Project Detection
  PROJECT_DETECT: 'project:detect',

  // Animation
  ANIMATION_LOAD_THEME: 'animation:load-theme',
  ANIMATION_GET_THEMES: 'animation:get-themes',

  // Logging
  LOG_SEND: 'log:send',
} as const;
