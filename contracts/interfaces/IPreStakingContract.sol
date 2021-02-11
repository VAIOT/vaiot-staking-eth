pragma solidity >=0.4.24;


interface IPreStakingContract {

    // Views

    function status(address account) external view returns (uint); // TODO right unit

    function balanceOf(address account) external view returns (uint256);

    function currentTotalStake() external view returns (uint256);

    function currentStakingLimit() external view returns (uint256);

    function earned(address account) external view returns (uint256);

    function rewardRate() external view returns (uint256);

    function timeUntilWithdrawal(address account) external view returns (uint256);

    // Mutative

    function stake(uint256 amount) external;

    function initializeWithdraw() external;

    function executeWithdraw() external;

}