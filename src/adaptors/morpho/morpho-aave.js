const { request, gql } = require('graphql-request');

const utils = require('../utils');

const subgraphMorphoCompound =
  'https://api.thegraph.com/subgraphs/name/morpho-labs/morpho-aavev2-mainnet';

const SECONDS_PER_YEAR = 3600 * 24 * 365;
const usdcToken = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const query = gql`
  query GetYieldsData {
    markets(first: 128) {
      address
      p2pIndexCursor
      reserveData {
        borrowPoolIndex
        supplyPoolIndex
        borrowPoolRate
        supplyPoolRate
        eth
        ltv
      }
      p2pData {
        p2pSupplyIndex
        p2pBorrowIndex
      }
      token {
        address
        decimals
        symbol
      }
      metrics {
        borrowBalanceOnPool
        supplyBalanceOnPool
        borrowBalanceInP2P
        supplyBalanceInP2P
        totalSupplyOnPool
        totalBorrowOnPool
      }
    }
  }
`;
const rateToAPY = (ratePerYear) =>
  Math.pow(1 + ratePerYear / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1;

module.exports = async () => {
  const data = (await request(subgraphMorphoCompound, query)).markets;
  const usdcMarket = data.find((market) => market.token.address === usdcToken);
  const ethPrice = usdcMarket.reserveData.eth / 1e18; // ETH / USDC price used to convert ETH to USD later
  return data.map((marketFromGraph) => {
    const totalSupplyOnPool =
      (+marketFromGraph.metrics.supplyBalanceOnPool *
        +marketFromGraph.reserveData.supplyPoolIndex) /
      `1e${27 + marketFromGraph.token.decimals}`;
    const totalSupplyP2P =
      (+marketFromGraph.metrics.supplyBalanceInP2P *
        +marketFromGraph.p2pData.p2pSupplyIndex) /
      `1e${27 + marketFromGraph.token.decimals}`;
    const totalSupply = totalSupplyOnPool + totalSupplyP2P;

    const totalBorrowOnPool =
      (+marketFromGraph.metrics.borrowBalanceOnPool *
        +marketFromGraph.reserveData.borrowPoolIndex) /
      `1e${27 + marketFromGraph.token.decimals}`;
    const totalBorrowP2P =
      (+marketFromGraph.metrics.borrowBalanceInP2P *
        +marketFromGraph.p2pData.p2pBorrowIndex) /
      `1e${27 + marketFromGraph.token.decimals}`;
    const totalBorrow = totalBorrowOnPool + totalBorrowP2P;
    const tvlUsd =
      (totalSupply * (marketFromGraph.reserveData.eth / 1e18)) / ethPrice;
    const tvlBorrow =
      (totalBorrow * (marketFromGraph.reserveData.eth / 1e18)) / ethPrice;
    const poolSupplyRate = +marketFromGraph.reserveData.supplyPoolRate;
    const poolBorrowRate = +marketFromGraph.reserveData.borrowPoolRate;

    const p2pIndexCursor = +marketFromGraph.p2pIndexCursor / 1e4;
    const poolSupplyAPY = rateToAPY(poolSupplyRate / 1e27);
    const poolBorrowAPY = rateToAPY(poolBorrowRate / 1e27);

    const spread = poolBorrowAPY - poolSupplyAPY;
    const p2pSupplyAPY = poolSupplyAPY + spread * p2pIndexCursor;
    const avgSupplyAPY =
      totalSupply === 0
        ? 0
        : (totalSupplyOnPool * poolSupplyAPY + totalSupplyP2P * p2pSupplyAPY) /
          totalSupply;

    const morphoRewards = 0; // MORPHO token is not transferable for now,
    // but distributed to suppliers. SO that's why I set the APY to 0,
    // to display the MORPHO token, but without an explicit APY
    return {
      pool: `morpho-aave-${marketFromGraph.token.address}`,
      chain: 'ethereum',
      project: 'morpho-aave',
      symbol: utils.formatSymbol(marketFromGraph.token.symbol),
      apyBase: avgSupplyAPY * 100,
      apyReward: morphoRewards * 100,
      rewardTokens: ['0x9994e35db50125e0df82e4c2dde62496ce330999'],
      tvlUsd,
      underlyingTokens: [marketFromGraph.token.address],
      apyBaseBorrow: poolBorrowAPY * 100,
      apyRewardBorrow: morphoRewards * 100,
      totalSupplyUsd: tvlUsd,
      totalBorrowUsd: tvlBorrow,
      ltv: marketFromGraph.reserveData.ltv / 1e4,
      poolMeta: 'Morpho Aave',
    };
  });
};
