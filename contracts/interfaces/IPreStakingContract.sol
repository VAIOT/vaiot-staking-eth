pragma solidity >=0.4.24;


interface IPreStakingContract {

    enum DepositStatus {NoDeposit, Deposited, WithdrawalInitialized, WithdrawalExecuted}

    // Views

    function status(address account) external view returns (DepositStatus);

    function balanceOf(address account) external view returns (uint256);

    function currentTotalStake() external view returns (uint256);

    function currentStakingLimit() external view returns (uint256);

    function earned(address account) external view returns (uint256);

    function rewardRate() external view returns (uint256);

    function timeUntilWithdrawal(address account) external view returns (uint256);

    // Mutative

    function deposit(uint256 amount) external;

    function initiateWithdrawal() external;

    function executeWithdrawal() external;

}