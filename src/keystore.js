const Debug = require('debug');
const fs = require('fs-extra');
const Promise = require('bluebird');
const inquirer = require('inquirer');
const uuidv4 = require('uuid/v4');
const { sign } = require('ethjs-signer');
const { generate, privateToAccount } = require('ethjs-account');

const debug = Debug('iexec:wallet');
const openAsync = Promise.promisify(fs.open);
const writeAsync = Promise.promisify(fs.write);
const readFileAsync = Promise.promisify(fs.readFile);
const writeFileAsync = Promise.promisify(fs.writeFile);

const WALLET_FILE_NAME = 'wallet.json';
const OVERWRITE_CONFIRMATION = `${WALLET_FILE_NAME} already exists, replace it with new wallet?`;
const CREATE_CONFIRMATION = `You don't have a ${WALLET_FILE_NAME} yet, create one?`;

const walletFromPrivKey = (
  privateKey,
  { suffix = true, lowercase = false } = {},
) => {
  const userWallet = privateToAccount(privateKey);

  const walletKeys = Object.keys(userWallet);
  if (!suffix) {
    walletKeys.forEach((e) => {
      userWallet[e] = userWallet[e].substr(2);
    });
  }
  if (lowercase) {
    walletKeys.forEach((e) => {
      userWallet[e] = userWallet[e].toLowerCase();
    });
  }
  return userWallet;
};

const save = async (userWallet, { force = false } = {}) => {
  const userJSONWallet = JSON.stringify(userWallet, null, 4);
  try {
    if (force) {
      await writeFileAsync(WALLET_FILE_NAME, userJSONWallet);
      return WALLET_FILE_NAME;
    }
    const fd = await openAsync(WALLET_FILE_NAME, 'wx');
    await writeAsync(fd, userJSONWallet, 0, 'utf8');
    await fs.close(fd);
    return WALLET_FILE_NAME;
  } catch (error) {
    if (error.code === 'EEXIST') {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: OVERWRITE_CONFIRMATION,
        },
      ]);
      if (answers.overwrite) {
        await writeFileAsync(WALLET_FILE_NAME, userJSONWallet);
        return WALLET_FILE_NAME;
      }
      throw Error('Aborted by user. keeping old wallet');
    }
    debug('save() error', error);
    throw error;
  }
};

const createAndSave = async (options) => {
  const userWallet = generate(uuidv4());
  const fileName = await save(userWallet, options);
  return { wallet: userWallet, fileName };
};

const load = async ({ suffix = true } = {}) => {
  try {
    const userWalletJSON = await readFileAsync(WALLET_FILE_NAME, 'utf8');
    const userWallet = JSON.parse(userWalletJSON);
    const derivedUserWallet = walletFromPrivKey(userWallet.privateKey, {
      suffix,
    });
    debug('derivedUserWallet', derivedUserWallet);
    return derivedUserWallet;
  } catch (error) {
    if (error.code === 'ENOENT') {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'create',
          message: CREATE_CONFIRMATION,
        },
      ]);
      if (answers.create) {
        return createAndSave();
      }

      throw new Error('Aborting. You need a wallet to continue');
    }
    debug('load() error', error);
    throw error;
  }
};

const loadAddress = async (options) => {
  const userWallet = await load(options);
  return userWallet.address;
};

const signTransaction = async (rawTx) => {
  try {
    const userWallet = await load();

    const signedTx = sign(rawTx, userWallet.privateKey);

    return signedTx;
  } catch (error) {
    debug('signTransaction()', error);
    throw error;
  }
};

const accounts = async () => {
  try {
    const userWallet = await load();

    return userWallet.address;
  } catch (error) {
    debug('accounts()', error);
    throw error;
  }
};

module.exports = {
  walletFromPrivKey,
  save,
  createAndSave,
  load,
  loadAddress,
  accounts,
  signTransaction,
};