# Agent Orchestration System

## Overview
Coordinates multiple specialized agents for autonomous debugging and repair of the MathMind application.

## Registered Agents

### Engineering Agents
| Agent | File | Capabilities |
|-------|------|--------------|
| Backend Architect | `agents/engineering-backend-architect.md` | System architecture, API design, database optimization |
| Senior Developer | `agents/engineering/senior-developer.md` | Full-stack implementation, bug fixes, code review |
| AI Engineer | `agents/engineering/ai-engineer.md` | AI/ML integration, model configuration, prompt engineering |
| DevOps Automator | `agents/engineering/devops-automator.md` | Server startup, deployment, infrastructure |
| Security Engineer | `agents/engineering/security-engineer.md` | Security audits, vulnerability fixes |

### Design Agents
| Agent | File | Capabilities |
|-------|------|--------------|
| UI Designer | `agents/design/design-ui-designer.md` | UI fixes, component design |
| UX Architect | `agents/design/design-ux-architect.md` | User flow, interaction design |

## Orchestration Workflow

### Phase 1: SCAN
**Agent**: DevOps Automator + Senior Developer

```bash
# Automated scanning script
1. Check server status (Python backend, frontend)
2. Scan for console errors in browser
3. Check API endpoint availability
4. Verify database connectivity
5. Scan codebase for syntax errors
6. Check dependency installation
```

**Deliverable**: Issue report with:
- List of errors found
- Severity classification (critical, warning, info)
- Affected components

### Phase 2: DIAGNOSE
**Agent**: Backend Architect + AI Engineer

```
Root Cause Analysis:
1. Analyze error patterns
2. Trace error origin in code
3. Identify configuration issues
4. Check model/provider mismatch
5. Verify network connectivity
```

**Deliverable**: Diagnosis report with:
- Root cause identification
- Affected files/lines
- Recommended fixes

### Phase 3: REPAIR
**Agent**: Senior Developer + Backend Architect

```
Repair Actions:
1. Fix code errors (syntax, logic, configuration)
2. Update model routing configuration
3. Fix API endpoint issues
4. Correct port configurations
5. Update environment settings
```

**Deliverable**: 
- Modified files
- Change log
- Migration steps (if needed)

### Phase 4: TEST
**Agent**: DevOps Automator

```
Test Suite:
1. Server startup test
2. API endpoint tests
3. Database connectivity test
4. Frontend build test
5. Integration tests
```

**Deliverable**: Test report with pass/fail status

### Phase 5: VALIDATE
**Agent**: Backend Architect + Senior Developer

```
Validation Checks:
1. Application starts without errors
2. All endpoints respond correctly
3. Frontend loads successfully
4. AI model integration works
5. No console errors in browser
```

**Deliverable**: Validation certificate

## Self-Repair Loop

```python
def self_repair_loop():
    max_iterations = 5
    iteration = 0
    
    while iteration < max_iterations:
        iteration += 1
        print(f"=== Repair Cycle {iteration}/{max_iterations} ===")
        
        # Phase 1: Scan
        issues = scan_repository()
        if not issues:
            print("✓ No issues found - system healthy")
            return True
        
        # Phase 2: Diagnose
        diagnosis = diagnose_root_cause(issues)
        
        # Phase 3: Repair
        repair_status = apply_repairs(diagnosis)
        if not repair_status:
            print("✗ Repair failed")
            continue
        
        # Phase 4: Test
        test_results = run_tests()
        if not test_results.passed:
            print(f"✗ Tests failed: {test_results.failures}")
            continue
        
        # Phase 5: Validate
        validation = validate_application()
        if validation.success:
            print("✓ System validated successfully")
            return True
        
        print("✗ Validation failed, retrying...")
    
    print("✗ Max iterations reached - manual intervention required")
    return False
```

## Agent Communication Protocol

### Task Assignment
```json
{
  "task_id": "unique-id",
  "agent": "agent-name",
  "action": "scan|diagnose|repair|test|validate",
  "context": {
    "issues": [],
    "files": [],
    "errors": []
  },
  "deadline": "timestamp"
}
```

### Task Result
```json
{
  "task_id": "unique-id",
  "status": "success|failure|partial",
  "result": {},
  "artifacts": [],
  "next_recommended_action": "string"
}
```

## Decision Matrix

| Issue Type | Primary Agent | Secondary Agent |
|------------|---------------|-----------------|
| Server won't start | DevOps Automator | Backend Architect |
| API errors | Backend Architect | Senior Developer |
| Frontend errors | Senior Developer | UI Designer |
| AI/Model errors | AI Engineer | Backend Architect |
| Security issues | Security Engineer | DevOps Automator |
| Performance issues | Backend Architect | DevOps Automator |

## Memory System

### Issue Memory
```json
{
  "resolved_issues": [
    {
      "issue": "Port mismatch frontend/backend",
      "solution": "Updated frontend API calls to port 5000",
      "files_changed": ["useApi.js", "useSocket.js"],
      "timestamp": "2026-03-11T10:30:00Z"
    }
  ],
  "recurring_issues": [],
  "system_knowledge": {
    "backend_port": 5000,
    "frontend_port": 5173,
    "ollama_port": 11434,
    "installed_models": ["qwen3.5", "gpt-oss", "llama3.1:8b"]
  }
}
```

## Success Criteria

The orchestration system succeeds when:
1. ✓ Backend server starts and responds on port 5000
2. ✓ Frontend loads without console errors
3. ✓ AI model integration works (Ollama or OpenRouter)
4. ✓ Practice quiz generation succeeds
5. ✓ No port mismatch errors (4000 vs 5000)
6. ✓ Model selection respects user settings
