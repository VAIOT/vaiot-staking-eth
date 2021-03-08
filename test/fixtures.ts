import chai from 'chai'
import { Contract, Wallet, BigNumber, providers } from 'ethers'
import { solidity, deployContract } from 'ethereum-waffle'

import { expandTo18Decimals, REWARDS_DURATION } from './utils'

import UniswapV2ERC20 from '@uniswap/v2-core/build/ERC20.json'
import TestERC20 from '../build/TestERC20.json'
import StakingRewards from '../build/StakingRewards.json'
import PreStakingContract from '../build/PreStakingContract.json'
import VAILockup from '../build/VAILockup.json'
import { Address } from 'ethereumjs-util'

chai.use(solidity)

interface StakingRewardsFixture {
  stakingRewards: Contract
  rewardsToken: Contract
  stakingToken: Contract
}

export async function stakingRewardsFixture([wallet]: Wallet[]): Promise<StakingRewardsFixture> {
  const rewardsToken = await deployContract(wallet, TestERC20, [expandTo18Decimals(1000000)])
  const stakingToken = await deployContract(wallet, UniswapV2ERC20, [expandTo18Decimals(1000000)])

  const stakingRewards = await deployContract(wallet, StakingRewards, [
    rewardsToken.address,
    stakingToken.address,
  ])

  return { stakingRewards, rewardsToken, stakingToken }
}
interface PreStakingFixture {
  token: Contract
  preStakingContract: Contract
  lockupContract: Contract
}

export async function preStakingFixture (
  [wallet, rewardsWallet]: Wallet[],
  provider: providers.Web3Provider
): Promise<PreStakingFixture> {

  const token = await deployContract(wallet, TestERC20, [expandTo18Decimals(400_000_000)])
  const preStakingContract = await deployContract(wallet, PreStakingContract, [token.address, rewardsWallet.address])
  const lockupContract = await deployContract(wallet, VAILockup, [token.address, 30, 4])

  return { token, preStakingContract, lockupContract }
}