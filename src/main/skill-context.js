'use strict';
const fs = require('fs');
const path = require('path');
const presentations = require('../shared/skill-presentations.json');

function prepareSkillProject({ skill, sourcePath, projectDir }) {
  if (!skill?.id || !sourcePath || !fs.existsSync(sourcePath)) throw new Error('所选技能不存在，请刷新技能中心');
  const content = fs.readFileSync(sourcePath, 'utf8');
  if (!content.trim()) throw new Error('所选技能说明为空');
  const activeSkill = { id: skill.id, name: presentations[skill.id]?.name || skill.name || skill.id, sourcePath, file: path.basename(sourcePath) };
  fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), `# 当前启用的技能：${activeSkill.name}\n\n技能 ID：${skill.id}\n技能原目录：${path.dirname(sourcePath)}\n技能文件：${sourcePath}\n\n本对话按此技能工作。技能说明中的相对引用和脚本从技能原目录解析；用户材料和输出保存在当前对话目录。信息不足时先询问，不编造项目数据。\n\n${content}\n`, 'utf8');
  return activeSkill;
}
module.exports = { prepareSkillProject };
