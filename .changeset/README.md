# Changesets

每个会影响使用者的 PR 都应提交一个 Changeset，用于记录版本级别和面向使用者的变更说明：

```bash
npm run changeset
```

- 兼容性修复或小幅改进使用 `patch`。
- 向后兼容的新功能使用 `minor`。
- 破坏性变更使用 `major`，并先取得维护者确认。
- 仅文档、测试或内部 CI 变更无需发布版本。

普通 PR 合并后，GitHub Actions 会创建或更新统一的 Release PR。只有维护者审查并合并该 Release PR，且仓库发布开关已启用时，流水线才会通过 npm OIDC 发布。
