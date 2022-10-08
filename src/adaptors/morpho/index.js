const morphoCompound = require('./morpho-compound');
const morphoAave = require('./morpho-aave');

const main = async () => {
  const morphoCompoundMarkets = await morphoCompound();
  const morhoAaveMarkets = await morphoAave();
  return [...morphoCompoundMarkets, ...morhoAaveMarkets];
};

module.exports = {
  timetravel: false,

  apy: main,
  url: 'https://morpho.xyz',
};
