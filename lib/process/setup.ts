#!/usr/bin/env node
import * as childProcess from 'child_process';
import * as fs from 'fs-extra';
 
export const NODE_LAMBDA_LAYER_DIR = `${process.cwd()}/bundle`;
export const NODE_LAMBDA_LAYER_RUNTIME_DIR_NAME = `nodejs`;
 
 
export const bundleNpm = () => {
  // create bundle directory
  copyPackageJson();
 
  // install package.json (production)
  childProcess.execSync(`npm --prefix ${getModulesInstallDirName()} install --production`, {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {...process.env},
    shell: 'bash'
  });
};
 
const copyPackageJson = () => {
 
  // copy package.json and package.lock.json
  fs.mkdirsSync(getModulesInstallDirName());
  ['package.json', 'package-lock.json']
    .map(file => fs.copyFileSync(`${process.cwd()}/${file}`, `${getModulesInstallDirName()}/${file}`));
 
};
 
const getModulesInstallDirName = (): string => {
  return `${NODE_LAMBDA_LAYER_DIR}/${NODE_LAMBDA_LAYER_RUNTIME_DIR_NAME}`;
};