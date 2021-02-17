import chai, { expect } from 'chai'
import { Contract, BigNumber, constants } from 'ethers'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'
import { ecsign } from 'ethereumjs-util'

import { stakingRewardsFixture } from './fixtures'
import { REWARDS_DURATION, expandTo18Decimals, mineBlock, getApprovalDigest } from './utils'

import StakingRewards from '../build/StakingRewards.json'

chai.use(solidity)

describe('StakingRewards', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
      gasPrice: '1',
    },
  })
  const [wallet, staker, secondStaker] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let stakingRewards: Contract
  let rewardsToken: Contract
  let stakingToken: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(stakingRewardsFixture)
    stakingRewards = fixture.stakingRewards
    rewardsToken = fixture.rewardsToken
    stakingToken = fixture.stakingToken
  })

  it('deploy cost', async () => {
    const stakingRewardsDeployment = await deployContract(wallet, StakingRewards, [
      rewardsToken.address,
      stakingToken.address,
    ])
    const receipt = await provider.getTransactionReceipt(stakingRewardsDeployment.deployTransaction.hash)
    expect(receipt.gasUsed).to.eq('2029357')
  })

  it('rewardsDuration', async () => {
    const rewardsDuration = await stakingRewards.rewardsDuration()
    expect(rewardsDuration).to.be.eq(REWARDS_DURATION)
  })

  const reward = expandTo18Decimals(100)
  async function start(periodReward: BigNumber): Promise<{ startTime: BigNumber; endTime: BigNumber }> {
    // send reward to the contract
    await rewardsToken.transfer(stakingRewards.address, periodReward)
    // must be called by rewardsDistribution
    await stakingRewards.notifyRewardAmount(periodReward)

    const startTime: BigNumber = await stakingRewards.lastUpdateTime()
    const endTime: BigNumber = await stakingRewards.periodFinish()
    expect(endTime).to.be.eq(startTime.add(REWARDS_DURATION))
    return { startTime, endTime }
  }

  it('full staking period', async () => {
    // stake with staker
    const stake = expandTo18Decimals(2)
    await stakingToken.transfer(staker.address, stake)
    await stakingToken.connect(staker).approve(stakingRewards.address, stake)
    await expect(stakingRewards.connect(staker).stake(stake))
      .to.emit(stakingRewards, 'Staked')
      .withArgs(staker.address, stake)

    const { endTime } = await start(reward)

    // fast-forward past the reward window
    await mineBlock(provider, endTime.add(1).toNumber())

    // unstake
    await stakingRewards.connect(staker).exit()
    const stakeEndTime: BigNumber = await stakingRewards.lastUpdateTime()
    expect(stakeEndTime).to.be.eq(endTime)

    const rewardAmount = await rewardsToken.balanceOf(staker.address)
    expect(reward.sub(rewardAmount).lte(reward.div(10000))).to.be.true // ensure result is within .01%
    expect(rewardAmount).to.be.eq(reward.div(REWARDS_DURATION).mul(REWARDS_DURATION))
  })

  it('stakeWithPermit', async () => {
    // stake with staker
    const stake = expandTo18Decimals(2)
    await stakingToken.transfer(staker.address, stake)

    // get permit
    const nonce = await stakingToken.nonces(staker.address)
    const deadline = constants.MaxUint256
    const digest = await getApprovalDigest(
      stakingToken,
      { owner: staker.address, spender: stakingRewards.address, value: stake },
      nonce,
      deadline
    )
    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(staker.privateKey.slice(2), 'hex'))

    await stakingRewards.connect(staker).stakeWithPermit(stake, deadline, v, r, s)

    const { endTime } = await start(reward)

    // fast-forward past the reward window
    await mineBlock(provider, endTime.add(1).toNumber())

    // unstake
    await stakingRewards.connect(staker).exit()
    const stakeEndTime: BigNumber = await stakingRewards.lastUpdateTime()
    expect(stakeEndTime).to.be.eq(endTime)

    const rewardAmount = await rewardsToken.balanceOf(staker.address)
    expect(reward.sub(rewardAmount).lte(reward.div(10000))).to.be.true // ensure result is within .01%
    expect(rewardAmount).to.be.eq(reward.div(REWARDS_DURATION).mul(REWARDS_DURATION))
  })

  it('premature withdrawal', async () => {

    const stakingRewardsLaterLaunch = await deployContract(wallet, StakingRewards, [
      rewardsToken.address,
      stakingToken.address,
    ])
    await rewardsToken.transfer(stakingRewardsLaterLaunch.address, reward)
    // stake with staker
    const stake = expandTo18Decimals(2)
    await stakingToken.transfer(staker.address, stake)
    await stakingToken.connect(staker).approve(stakingRewardsLaterLaunch.address, stake)
    await expect(stakingRewardsLaterLaunch.connect(staker).stake(stake))
      .to.emit(stakingRewardsLaterLaunch, 'Staked')
      .withArgs(staker.address, stake)
    await stakingRewardsLaterLaunch.notifyRewardAmount(reward)
    const launchTimestamp = await stakingRewardsLaterLaunch.launchTimestamp()

    // fast-forward just before withdrawal is allowed
    await mineBlock(provider, launchTimestamp.add(734400).sub(1).toNumber())

    await expect(stakingRewardsLaterLaunch.connect(staker).getReward()).to.be.revertedWith('Not enough days passed')

    // fast-forward to be able to withdraw
    await mineBlock(provider, launchTimestamp.add(734400).toNumber())

    await expect(stakingRewardsLaterLaunch.connect(staker).getReward()).to.emit(stakingRewardsLaterLaunch, 'RewardPaid')
  })

  it('half staking period', async () => {
    const { startTime, endTime } = await start(reward)

    // fast-forward ~halfway through the reward window
    await mineBlock(provider, startTime.add(endTime.sub(startTime).div(2)).toNumber())

    // stake with staker
    const stake = expandTo18Decimals(2)
    await stakingToken.transfer(staker.address, stake)
    await stakingToken.connect(staker).approve(stakingRewards.address, stake)
    await stakingRewards.connect(staker).stake(stake)
    const stakeStartTime: BigNumber = await stakingRewards.lastUpdateTime()

    // fast-forward past the reward window
    await mineBlock(provider, endTime.add(1).toNumber())

    // unstake
    await stakingRewards.connect(staker).exit()
    const stakeEndTime: BigNumber = await stakingRewards.lastUpdateTime()
    expect(stakeEndTime).to.be.eq(endTime)

    const rewardAmount = await rewardsToken.balanceOf(staker.address)
    expect(reward.div(2).sub(rewardAmount).lte(reward.div(2).div(10000))).to.be.true // ensure result is within .01%
    expect(rewardAmount).to.be.eq(reward.div(REWARDS_DURATION).mul(endTime.sub(stakeStartTime)))
  }).retries(2) // TODO investigate flakiness

  it('two stakers', async () => {
    // stake with first staker
    const stake = expandTo18Decimals(2)
    await stakingToken.transfer(staker.address, stake)
    await stakingToken.connect(staker).approve(stakingRewards.address, stake)
    await stakingRewards.connect(staker).stake(stake)

    const { startTime, endTime } = await start(reward)

    // fast-forward ~halfway through the reward window
    await mineBlock(provider, startTime.add(endTime.sub(startTime).div(2)).toNumber())

    // stake with second staker
    await stakingToken.transfer(secondStaker.address, stake)
    await stakingToken.connect(secondStaker).approve(stakingRewards.address, stake)
    await stakingRewards.connect(secondStaker).stake(stake)

    // fast-forward past the reward window
    await mineBlock(provider, endTime.add(1).toNumber())

    // unstake
    await stakingRewards.connect(staker).exit()
    const stakeEndTime: BigNumber = await stakingRewards.lastUpdateTime()
    expect(stakeEndTime).to.be.eq(endTime)
    await stakingRewards.connect(secondStaker).exit()

    const rewardAmount = await rewardsToken.balanceOf(staker.address)
    const secondRewardAmount = await rewardsToken.balanceOf(secondStaker.address)
    const totalReward = rewardAmount.add(secondRewardAmount)

    // ensure results are within .01%
    expect(reward.sub(totalReward).lte(reward.div(10000))).to.be.true
    expect(totalReward.mul(3).div(4).sub(rewardAmount).lte(totalReward.mul(3).div(4).div(10000)))
    expect(totalReward.div(4).sub(secondRewardAmount).lte(totalReward.div(4).div(10000)))
  })

  it('claiming rewards without withdrawing', async () => {
    // stake with staker
    const stake = expandTo18Decimals(2)
    await stakingToken.transfer(staker.address, stake)
    await stakingToken.connect(staker).approve(stakingRewards.address, stake)
    await expect(stakingRewards.connect(staker).stake(stake))
      .to.emit(stakingRewards, 'Staked')
      .withArgs(staker.address, stake)

    const { startTime, endTime } = await start(reward)

    const halfStakeTime = endTime.sub(endTime.sub(startTime).div(2))

    await mineBlock(provider, halfStakeTime.toNumber())

    await expect(stakingRewards.connect(staker).getReward()).to.emit(stakingRewards, 'RewardPaid')
    const halfStakeBalance = await rewardsToken.balanceOf(staker.address)

    await mineBlock(provider, endTime.add(1).toNumber())
    // unstake
    await stakingRewards.connect(staker).exit()
    const stakeEndTime: BigNumber = await stakingRewards.lastUpdateTime()
    expect(stakeEndTime).to.be.eq(endTime)

    const rewardAmount = await rewardsToken.balanceOf(staker.address)
    expect(rewardAmount.div(2).sub(halfStakeBalance).lte(rewardAmount.div(2).div(10000))).to.be.true
    expect(reward.sub(rewardAmount).lte(reward.div(10000))).to.be.true // ensure result is within .01%
    expect(halfStakeBalance).to.be.eq(reward.div(REWARDS_DURATION).mul(endTime.sub(startTime).div(2)))
    expect(rewardAmount).to.be.eq(reward.div(REWARDS_DURATION).mul(REWARDS_DURATION))
  }).retries(2)

  it('multiperiod staking', async () => {
    // stake with staker
    const stake = expandTo18Decimals(2)
    await stakingToken.transfer(staker.address, stake)
    await stakingToken.connect(staker).approve(stakingRewards.address, stake)
    await expect(stakingRewards.connect(staker).stake(stake))
      .to.emit(stakingRewards, 'Staked')
      .withArgs(staker.address, stake)

    const firstPeriod = await start(reward)

    await mineBlock(provider, firstPeriod.endTime.add(1).toNumber())

    const earnedOnFirstPeriod = await stakingRewards.earned(staker.address)

    const secondPeriod = await start(reward)
    await mineBlock(provider, secondPeriod.endTime.add(1).toNumber())
    // unstake
    await stakingRewards.connect(staker).exit()
    const stakeEndTime: BigNumber = await stakingRewards.lastUpdateTime()
    const totalReward = await rewardsToken.balanceOf(staker.address)
    expect(stakeEndTime).to.be.eq(secondPeriod.endTime)

    expect(reward.mul(2).sub(totalReward).lte(reward.mul(2).div(10000))).to.be.true
    expect(reward.sub(earnedOnFirstPeriod).lte(reward.div(10000))).to.be.true
    expect(totalReward).to.be.eq(
      reward
        .mul(2)
        .div(2 * REWARDS_DURATION)
        .mul(2 * REWARDS_DURATION)
    )
    expect(earnedOnFirstPeriod).to.be.eq(reward.div(REWARDS_DURATION).mul(REWARDS_DURATION))
  }).retries(2)

  it('multiperiod staking: half of first period', async () => {
    // stake with staker
    const stake = expandTo18Decimals(2)
    await stakingToken.transfer(staker.address, stake)
    await stakingToken.connect(staker).approve(stakingRewards.address, stake)

    const firstPeriod = await start(reward)
    await mineBlock(provider, firstPeriod.endTime.sub(firstPeriod.endTime.sub(firstPeriod.startTime).div(2)).toNumber())

    await expect(stakingRewards.connect(staker).stake(stake))
      .to.emit(stakingRewards, 'Staked')
      .withArgs(staker.address, stake)
    const stakeStartTime: BigNumber = await stakingRewards.lastUpdateTime()

    await mineBlock(provider, firstPeriod.endTime.add(1).toNumber())

    const earnedOnFirstPeriod = await stakingRewards.earned(staker.address)

    const secondPeriod = await start(reward)
    await mineBlock(provider, secondPeriod.endTime.add(1).toNumber())
    // unstake
    await stakingRewards.connect(staker).exit()
    const stakeEndTime: BigNumber = await stakingRewards.lastUpdateTime()
    const totalReward = await rewardsToken.balanceOf(staker.address)
    expect(stakeEndTime).to.be.eq(secondPeriod.endTime)

    expect(reward.div(2).mul(3).sub(totalReward).lte(reward.div(2).mul(3).div(10000))).to.be.true
    expect(reward.div(2).sub(earnedOnFirstPeriod).lte(reward.div(2).div(10000))).to.be.true
    expect(totalReward).to.be.eq(
      reward
        .div(REWARDS_DURATION)
        .mul(firstPeriod.endTime.sub(stakeStartTime).add(secondPeriod.endTime.sub(secondPeriod.startTime)))
    )
    expect(earnedOnFirstPeriod).to.be.eq(reward.div(REWARDS_DURATION).mul(firstPeriod.endTime.sub(stakeStartTime)))
  }).retries(2)

  it('multiperiod staking: two stakers', async () => {
    const secondReward = expandTo18Decimals(10)
    const stake = expandTo18Decimals(1)
    const secondStake = expandTo18Decimals(3)
    await stakingToken.transfer(staker.address, stake)
    await stakingToken.connect(staker).approve(stakingRewards.address, stake)
    await stakingToken.transfer(secondStaker.address, secondStake)
    await stakingToken.connect(secondStaker).approve(stakingRewards.address, secondStake)

    const firstPeriod = await start(reward)

    await expect(stakingRewards.connect(staker).stake(stake))
      .to.emit(stakingRewards, 'Staked')
      .withArgs(staker.address, stake)

    await mineBlock(provider, firstPeriod.endTime.add(1).toNumber())

    const secondPeriod = await start(secondReward)

    await expect(stakingRewards.connect(secondStaker).stake(secondStake))
      .to.emit(stakingRewards, 'Staked')
      .withArgs(secondStaker.address, secondStake)

    await mineBlock(provider, secondPeriod.endTime.add(1).toNumber())

    // unstake
    await stakingRewards.connect(staker).exit()
    await stakingRewards.connect(secondStaker).exit()
    const stakeEndTime: BigNumber = await stakingRewards.lastUpdateTime()
    const rewardStaker = await rewardsToken.balanceOf(staker.address)
    const rewardSecondStaker = await rewardsToken.balanceOf(secondStaker.address)
    const totalEarnedReward = rewardStaker.add(rewardSecondStaker)
    const totalReward = reward.add(secondReward)
    expect(stakeEndTime).to.be.eq(secondPeriod.endTime)

    expect(totalReward.sub(totalEarnedReward).lte(totalReward.div(10000))).to.be.true
    expect(
      reward
        .add(secondReward.div(4))
        .sub(rewardStaker)
        .lte(reward.add(secondReward.div(4)).div(10000))
    ).to.be.true
    expect(secondReward.div(4).mul(3).sub(rewardSecondStaker).lte(secondReward.div(4).mul(3).div(10000))).to.be.true
    expect(totalEarnedReward).to.be.eq(
      reward.div(REWARDS_DURATION).mul(REWARDS_DURATION).add(secondReward.div(REWARDS_DURATION).mul(REWARDS_DURATION))
    )
    expect(rewardStaker).to.be.eq(
      reward
        .div(REWARDS_DURATION)
        .mul(REWARDS_DURATION)
        .add(secondReward.div(REWARDS_DURATION).mul(REWARDS_DURATION).div(4))
    )
    expect(rewardSecondStaker).to.be.eq(secondReward.div(REWARDS_DURATION).mul(REWARDS_DURATION).div(4).mul(3))
  }).retries(2)
})
