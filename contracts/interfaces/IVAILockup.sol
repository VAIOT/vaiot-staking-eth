pragma solidity >=0.4.24;

interface IVAILockup {

    function beneficiaryCurrentAmount(address beneficiary) external view returns (uint256);

    function stake(address beneficiary, uint256 stakeAmount) external;

    function unstake(address beneficiary, uint256 stakeAmount, uint256 rewardsAmount) external;
}