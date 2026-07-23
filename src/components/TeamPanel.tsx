import { Crown, Loader2, Plus, Save, Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ExpertTeam } from "../types";
import type { WorkbenchProps } from "../workbenchTypes";

type TeamDraft = Pick<ExpertTeam, "name" | "goal" | "enabled" | "leadRoleId" | "memberRoleIds">;

const emptyDraft = (): TeamDraft => ({
  name: "",
  goal: "",
  enabled: true,
  leadRoleId: null,
  memberRoleIds: []
});

export function TeamPanel({
  agentConfig,
  roleStore,
  teamStore,
  saving,
  busyAction,
  error,
  createTeam,
  updateTeam,
  selectTeam,
  deleteTeam
}: WorkbenchProps) {
  const copy = agentConfig.language === "en" ? englishCopy : chineseCopy;
  const selectedTeam = useMemo(
    () => teamStore.teams.find((team) => team.id === teamStore.selectedTeamId) || null,
    [teamStore]
  );
  const [creating, setCreating] = useState(!selectedTeam);
  const [draft, setDraft] = useState<TeamDraft>(() => selectedTeam ? toDraft(selectedTeam) : emptyDraft());
  const busy = saving && busyAction === "team-save";

  useEffect(() => {
    if (selectedTeam) {
      setDraft(toDraft(selectedTeam));
      setCreating(false);
    } else if (!teamStore.teams.length) {
      setDraft(emptyDraft());
      setCreating(true);
    }
  }, [selectedTeam?.id, selectedTeam?.updatedAt, teamStore.teams.length]);

  function startCreating() {
    setCreating(true);
    setDraft(emptyDraft());
  }

  async function chooseTeam(teamId: string) {
    await selectTeam(teamId);
  }

  function toggleMember(roleId: string) {
    setDraft((current) => {
      const joined = current.memberRoleIds.includes(roleId);
      const memberRoleIds = joined
        ? current.memberRoleIds.filter((id) => id !== roleId)
        : [...current.memberRoleIds, roleId];
      const leadRoleId = joined && current.leadRoleId === roleId
        ? memberRoleIds[0] || null
        : current.leadRoleId || memberRoleIds[0] || null;
      return { ...current, memberRoleIds, leadRoleId };
    });
  }

  async function save() {
    if (!draft.name.trim() || !draft.memberRoleIds.length || !draft.leadRoleId) return;
    if (creating || !selectedTeam) {
      await createTeam({ ...draft, name: draft.name.trim(), goal: draft.goal.trim() });
      return;
    }
    await updateTeam(selectedTeam.id, { ...draft, name: draft.name.trim(), goal: draft.goal.trim() });
  }

  async function remove() {
    if (!selectedTeam) return;
    if (!window.confirm(copy.deleteConfirm)) return;
    await deleteTeam(selectedTeam.id);
  }

  const leadRole = roleStore.roles.find((role) => role.id === draft.leadRoleId);
  const memberRoles = draft.memberRoleIds
    .filter((roleId) => roleId !== draft.leadRoleId)
    .map((roleId) => roleStore.roles.find((role) => role.id === roleId))
    .filter(Boolean);
  const canSave = Boolean(draft.name.trim() && draft.memberRoleIds.length && draft.leadRoleId);

  return (
    <div className="drawer-body team-builder">
      <div className="team-toolbar">
        <label>
          <span>{copy.currentTeam}</span>
          <select
            value={creating ? "" : selectedTeam?.id || ""}
            onChange={(event) => event.target.value ? chooseTeam(event.target.value) : startCreating()}
          >
            <option value="">{copy.newTeam}</option>
            {teamStore.teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </label>
        <button type="button" className="team-icon-button" onClick={startCreating} aria-label={copy.newTeam}>
          <Plus size={18} />
        </button>
      </div>

      <section className="team-identity">
        <label className="field">
          {copy.name}
          <input
            value={draft.name}
            maxLength={80}
            placeholder={copy.namePlaceholder}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
        <label className="field">
          {copy.goal}
          <textarea
            value={draft.goal}
            maxLength={2000}
            rows={3}
            placeholder={copy.goalPlaceholder}
            onChange={(event) => setDraft({ ...draft, goal: event.target.value })}
          />
        </label>
        <label className="team-enabled">
          <span>
            <strong>{copy.enabled}</strong>
            <small>{draft.enabled ? copy.enabledHint : copy.disabledHint}</small>
          </span>
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
          />
        </label>
      </section>

      <section className="team-section">
        <div className="team-section-title">
          <div>
            <h3>{copy.members}</h3>
            <p>{copy.memberCount(draft.memberRoleIds.length)}</p>
          </div>
          <UserPlus size={18} />
        </div>
        <div className="team-role-grid">
          {roleStore.roles.map((role) => {
            const joined = draft.memberRoleIds.includes(role.id);
            const isLead = draft.leadRoleId === role.id;
            return (
              <article className={`team-role-card ${joined ? "joined" : ""}`} key={role.id}>
                <button
                  type="button"
                  className="team-role-main"
                  aria-pressed={joined}
                  onClick={() => toggleMember(role.id)}
                >
                  <span className="team-role-avatar" style={{ background: role.accentColor || "#6366f1" }}>{role.avatar || "🤖"}</span>
                  <span>
                    <strong>{role.name}</strong>
                    <small>{role.roleTitle}</small>
                  </span>
                  <span className={`join-indicator ${joined ? "on" : ""}`}>{joined ? copy.joined : copy.notJoined}</span>
                </button>
                {joined && (
                  <button
                    type="button"
                    className={`lead-button ${isLead ? "active" : ""}`}
                    onClick={() => setDraft({ ...draft, leadRoleId: role.id })}
                  >
                    <Crown size={14} />
                    {isLead ? copy.lead : copy.setLead}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="team-flow" aria-label={copy.structure}>
        <div className="team-section-title">
          <div>
            <h3>{copy.structure}</h3>
            <p>{copy.structureHint}</p>
          </div>
          <Users size={18} />
        </div>
        {leadRole ? (
          <div className="team-flow-content">
            <div className="team-flow-lead">
              <Crown size={15} />
              <span>{leadRole.avatar || "🤖"} {leadRole.name}</span>
            </div>
            <div className="team-flow-line" />
            <div className="team-flow-members">
              {memberRoles.length
                ? memberRoles.map((role) => <span key={role!.id}>{role!.avatar || "🤖"} {role!.name}</span>)
                : <span>{copy.noMembers}</span>}
            </div>
          </div>
        ) : (
          <p className="team-empty">{copy.chooseMember}</p>
        )}
      </section>

      {error && <div className="error-banner">{error}</div>}
      <div className="team-actions">
        <button type="button" onClick={save} disabled={busy || !canSave}>
          {busy ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
          {creating ? copy.create : copy.save}
        </button>
        {!creating && selectedTeam && (
          <button type="button" className="danger" onClick={remove} disabled={busy}>
            <Trash2 size={16} />
            {copy.delete}
          </button>
        )}
      </div>
    </div>
  );
}

function toDraft(team: ExpertTeam): TeamDraft {
  return {
    name: team.name,
    goal: team.goal,
    enabled: team.enabled,
    leadRoleId: team.leadRoleId,
    memberRoleIds: [...team.memberRoleIds]
  };
}

const chineseCopy = {
  currentTeam: "当前专家团",
  newTeam: "新建专家团",
  name: "专家团名称",
  namePlaceholder: "例如：产品研发专家团",
  goal: "团队目标",
  goalPlaceholder: "描述专家团要共同完成的结果",
  enabled: "启用专家团",
  enabledHint: "配置已启用",
  disabledHint: "配置已停用",
  members: "成员选择",
  memberCount: (count: number) => `已加入 ${count} 个角色`,
  joined: "已加入",
  notJoined: "未加入",
  lead: "Lead",
  setLead: "设为 Lead",
  structure: "团队结构",
  structureHint: "Lead 负责路由，成员负责专业结果",
  noMembers: "暂无其他成员",
  chooseMember: "至少选择一个角色，并指定 Lead。",
  create: "创建专家团",
  save: "保存配置",
  delete: "删除",
  deleteConfirm: "确定删除这个专家团吗？"
};

const englishCopy = {
  currentTeam: "Current team",
  newTeam: "New expert team",
  name: "Team name",
  namePlaceholder: "e.g. Product Engineering Team",
  goal: "Team goal",
  goalPlaceholder: "Describe the outcome this team should deliver",
  enabled: "Enable expert team",
  enabledHint: "Configuration enabled",
  disabledHint: "Configuration disabled",
  members: "Choose members",
  memberCount: (count: number) => `${count} role${count === 1 ? "" : "s"} joined`,
  joined: "Joined",
  notJoined: "Not joined",
  lead: "Lead",
  setLead: "Set Lead",
  structure: "Team structure",
  structureHint: "Lead routes work; members own specialist outcomes",
  noMembers: "No additional members",
  chooseMember: "Choose at least one role and assign a Lead.",
  create: "Create team",
  save: "Save",
  delete: "Delete",
  deleteConfirm: "Delete this expert team?"
};
