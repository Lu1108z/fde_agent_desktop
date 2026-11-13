# 业务数据口径模板（研发交付）

> 项目：云州一院运营决策智能体（示例）　需求总签版本：REQ-v1.0

> 本文件为 FDE 五阶段流程测试产物，人员、签字、数据均为模拟示例数据。

## 一、全局口径约定

| 数据源与责任人 | 过滤 | 去重 | 时间口径 | 单位与精度 | 权限与敏感分级 |
| --- | --- | --- | --- | --- | --- |
| CDR（钱永安）、HRP（赵敏）、病案导出（孙浩）、口径表（陈立文） | 剔除作废、退号、测试科室（dept_code 以 T 开头） | 挂号按 reg_id、费用按 fee_id、病例按 case_id 去重 | 就诊类按发生日期；出院类按出院日期；财务类按结账月 | 金额元保留 2 位、比率保留 1 位小数、CMI 保留 2 位 | 院领导与运营管理部全院；职能科室按条线；临床科室仅本科室；不返回患者标识 |

## 二、数据集清单

| 数据集编码 | 名称与用途 | 标准库/新增 | 粒度与主键 | 更新频率 | 来源系统与版本 | 负责人 | SQL 或复用说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DS-01 | 就诊与床位日报（标准库） | 标准库 | 科室 × 日；主键 dept_code+stat_date | 每日 06:00 | CDR（SDR 标准库 v2.3） | 信息中心 钱永安 | 复用 SDR 标准库 v2.3 |
| DS-02 | 住院费用明细（标准库） | 标准库 | 费用明细行；主键 fee_id | 每日 06:00 | CDR（SDR 标准库 v2.3） | 信息中心 钱永安 | 复用 SDR 标准库 v2.3 |
| DS-03 | 科室收入与成本 | 新增 | 科室 × 月；主键 dept_code+ym | 每月 11 日 | HRP/HR 系统 | 财务处 赵敏 | `SELECT d.dept_code, c.ym, c.medical_income, c.drug_income_ex_herb, c.material_income, c.total_cost FROM hrp.v_dept_cost c JOIN sdr.dim_dept d ON d.hrp_dept_id = c.dept_id WHERE c.closed_flag = 1` |
| DS-04 | DRG 入组明细 | 新增 | 病例；主键 case_id | 每月 5 日 | 线下文件（病案系统导出） | 医务处 DRG 办 孙浩 | `SELECT case_id, drg_code, drg_name, dept_code, weight, total_fee, pay_standard, drug_fee, material_fee FROM sdr.ods_drg_group WHERE settle_month = :ym` |
| DS-05 | 院级指标口径表 | 新增 | 指标 × 版本；主键 metric_code+version | 按版本 | 线下文件（运营管理部） | 运营管理部 陈立文 | `SELECT metric_code, metric_name, formula, filter_rule, version FROM sdr.dim_metric_caliber WHERE version = 'v1.0'` |

## 三、新增数据集字段明细

| 数据集编码 | 字段编码 | 来源字段或计算规则 | 类型 | 敏感级别 | 访问策略 |
| --- | --- | --- | --- | --- | --- |
| DS-03 | medical_income | hrp.v_dept_cost.medical_income | decimal(14,2) | 内部 | 运营管理部、财务处、院领导 |
| DS-03 | drug_income_ex_herb | hrp.v_dept_cost.drug_income - herb_income | decimal(14,2) | 内部 | 同上 |
| DS-03 | total_cost | hrp.v_dept_cost.total_cost | decimal(14,2) | 内部 | 同上 |
| DS-04 | drg_code | 导出文件 DRG编码 | varchar(8) | 内部 | 运营管理部、DRG 办 |
| DS-04 | total_fee | 导出文件 总费用 | decimal(12,2) | 敏感 | 运营管理部、DRG 办 |
| DS-04 | pay_standard | 导出文件 支付标准 | decimal(12,2) | 内部 | 运营管理部、DRG 办 |
| DS-05 | metric_code | 口径表 指标编号 | varchar(8) | 公开 | 全员只读 |
| DS-05 | formula | 口径表 计算公式 | text | 公开 | 全员只读 |
| DS-05 | version | 口径表 版本 | varchar(8) | 公开 | 全员只读 |

## 四、指标口径明细

| 指标编号 | 指标与类型 | 计算及过滤口径 | 来源库.表(字段) | 取数 SQL | 真实样例值 | 核对方 |
| --- | --- | --- | --- | --- | --- | --- |
| M-01 | 门急诊人次（原子） | 挂号成功且未退号的门急诊人次 | cdr.v_reg(reg_status, visit_type) | `SELECT COUNT(*) FROM cdr.v_reg WHERE reg_status = 'OK' AND visit_type IN ('门诊','急诊') AND reg_date BETWEEN :s AND :e` | 2026-05：226,140 | 运营管理部 陈立文 |
| M-02 | 出院人次（原子） | 出院日期在统计期内，不含转科 | cdr.v_discharge(discharge_date, transfer_flag) | `SELECT COUNT(*) FROM cdr.v_discharge WHERE transfer_flag = 0 AND discharge_date BETWEEN :s AND :e` | 2026-05：8,216 | 运营管理部 陈立文 |
| M-03 | 床位使用率（派生） | 实际占用总床日 ÷ 实际开放总床日，不含加床 | cdr.v_bed_daily(occupied, opened, extra_bed) | `SELECT SUM(occupied - extra_bed) / SUM(opened) FROM cdr.v_bed_daily WHERE stat_date BETWEEN :s AND :e` | 2026-05：94.6% | 运营管理部 陈立文 |
| M-04 | 平均住院日（派生） | 出院者占用总床日 ÷ 出院人次 | cdr.v_discharge(los_days) | `SELECT AVG(los_days) FROM cdr.v_discharge WHERE transfer_flag = 0 AND discharge_date BETWEEN :s AND :e` | 2026-05：7.3 天 | 运营管理部 陈立文 |
| M-05 | 次均住院费用（派生） | 出院患者住院总费用 ÷ 出院人次 | cdr.v_inp_fee(total_fee) | `SELECT SUM(f.total_fee) / COUNT(DISTINCT f.visit_id) FROM cdr.v_inp_fee f JOIN cdr.v_discharge d ON d.visit_id = f.visit_id WHERE d.discharge_date BETWEEN :s AND :e` | 2026-05：19,860 元 | 运营管理部 陈立文 |
| M-06 | 药占比（派生） | 药品收入（不含中药饮片）÷ 医疗收入 | hrp.v_dept_cost(drug_income_ex_herb, medical_income) | `SELECT SUM(drug_income_ex_herb) / SUM(medical_income) FROM sdr.ads_dept_cost WHERE ym = :ym` | 2026-05：26.3% | 运营管理部 陈立文 |
| M-07 | 耗占比（派生） | 卫生材料收入 ÷ 医疗收入 | hrp.v_dept_cost(material_income, medical_income) | `SELECT SUM(material_income) / SUM(medical_income) FROM sdr.ads_dept_cost WHERE ym = :ym` | 2026-05：21.7% | 运营管理部 陈立文 |
| M-08 | CMI（派生） | 入组病例权重之和 ÷ 入组例数 | sdr.ods_drg_group(weight) | `SELECT SUM(weight) / COUNT(*) FROM sdr.ods_drg_group WHERE settle_month = :ym` | 2026-05：1.07 | 运营管理部 陈立文 |
| M-09 | DRG 结余（派生） | 支付标准合计 - 实际费用合计（入组病例） | sdr.ods_drg_group(pay_standard, total_fee) | `SELECT SUM(pay_standard - total_fee) FROM sdr.ods_drg_group WHERE settle_month = :ym` | 2026-05：-168 万元 | 运营管理部 陈立文 |

## 五、信息科与研发核对

2026-07-08 信息中心钱永安、财务处赵敏、DRG 办孙浩与研发数据工程师逐条核对 DS-01~DS-05 与 M-01~M-09 的 SQL 和 2026 年 4 月样例值，全部一致；权限按全局约定配置。凭据：stage3/evidence/data-metric-review.md。样例值为模拟示例数据。
