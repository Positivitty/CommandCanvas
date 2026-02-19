import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import path from 'path';
import fs from 'fs-extra';

const config: ForgeConfig = {
  packagerConfig: {
    icon: path.resolve(__dirname, 'assets', 'icon'),
    extraResource: [
      path.resolve(__dirname, 'assets', 'animations'),
    ],
    asar: {
      unpack: '**/node_modules/node-pty/**',
    },
  },
  rebuildConfig: {},
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      // Copy node-pty into the packaged app since Vite externalizes it
      const src = path.resolve(__dirname, 'node_modules', 'node-pty');
      const dest = path.resolve(buildPath, 'node_modules', 'node-pty');
      await fs.copy(src, dest);
    },
  },
  makers: [
    new MakerSquirrel({
      iconUrl: 'https://raw.githubusercontent.com/swosu/House_Aaron/main/assets/icon.ico',
      setupIcon: path.resolve(__dirname, 'assets', 'icon.ico'),
    }),
    new MakerZIP({}, ['darwin']),
    new MakerDeb({
      options: {
        icon: path.resolve(__dirname, 'assets', 'icon.png'),
      },
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
