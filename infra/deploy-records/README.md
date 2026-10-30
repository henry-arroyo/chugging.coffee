# Deploy records

`infra:deploy` writes one JSON record per deployment here (stack, account, caller, git commit,
template hash, outputs). Commit them: they are the history used for rollback.
