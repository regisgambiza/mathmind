from flask import Blueprint, request, jsonify, make_response
import os
import requests
import json
import logging

logger = logging.getLogger('ai_proxy')

router = Blueprint('ai', __name__)

OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
# OpenRouter model - can be a comma-separated list for fallback, or a single model
OPENROUTER_MODEL_RAW = os.environ.get('OPENROUTER_MODEL', 'openai/gpt-4o-mini,google/gemini-2.0-flash-001,qwen/qwen3-235b-a22b-thinking-2507')
# Parse the model list and use the first one as default
OPENROUTER_MODELS = [m.strip() for m in OPENROUTER_MODEL_RAW.split(',') if m.strip()]
OPENROUTER_MODEL = OPENROUTER_MODELS[0] if OPENROUTER_MODELS else 'openai/gpt-4o-mini'

def _try_model(api_key, headers_base, payload, model, timeout=30):
    """Try a single model and return (success, response_data, error_msg)."""
    headers = headers_base.copy()
    payload_with_model = payload.copy()
    payload_with_model['model'] = model
    
    logger.info(f"[ai/complete] Trying model: {model} (timeout: {timeout}s)")
    
    try:
        response = requests.post(
            f"{OPENROUTER_BASE_URL}/chat/completions",
            headers=headers,
            json=payload_with_model,
            stream=False,
            timeout=timeout
        )
        
        logger.info(f"[ai/complete] {model} response status: {response.status_code}")
        
        if not response.ok:
            error_text = response.text[:200] if response.text else 'No response body'
            logger.warning(f"[ai/complete] {model} failed: {response.status_code} - {error_text}")
            return False, None, f"Model {model} returned {response.status_code}"
        
        response_data = response.json()
        completion_text = response_data['choices'][0]['message']['content']
        logger.info(f"[ai/complete] {model} succeeded")
        return True, completion_text, None
        
    except requests.exceptions.Timeout:
        logger.warning(f"[ai/complete] {model} timed out after {timeout}s")
        return False, None, f"Model {model} timed out"
    except Exception as e:
        logger.warning(f"[ai/complete] {model} error: {e}")
        return False, None, f"Model {model} error: {str(e)}"


@router.route('/complete', methods=['POST'])
def ai_complete():
    """Proxy AI completion requests to OpenRouter with automatic model fallback."""
    data = request.get_json()
    prompt = data.get('prompt') if data else None

    logger.info(f"[ai/complete] ========== REQUEST START ==========")
    logger.info(f"[ai/complete] Received data: {data}")
    logger.info(f"[ai/complete] Prompt length: {len(prompt) if prompt else 0}")

    if not prompt:
        logger.error("[ai/complete] Missing prompt in request")
        return jsonify({'error': 'Prompt is required'}), 400

    api_key = os.environ.get('OPENROUTER_API_KEY')
    if not api_key:
        logger.error("[ai/complete] OPENROUTER_API_KEY is missing in environment variables")
        return jsonify({'error': 'AI service not configured on server'}), 503

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}',
        'HTTP-Referer': os.environ.get('BACKEND_URL', 'http://localhost:5000'),
        'X-Title': 'MathMind AI Tutor',
    }

    payload = {
        'messages': [{'role': 'user', 'content': prompt}],
        'stream': False,
    }

    # Try each model in order with increasing timeouts
    last_error = None
    for i, model in enumerate(OPENROUTER_MODELS):
        timeout = 30 + (i * 15)  # First: 30s, Second: 45s, Third: 60s
        
        success, result, error = _try_model(api_key, headers, payload, model, timeout)
        
        if success:
            response_json = json.dumps({'completion': result})
            logger.info(f"[ai/complete] ========== REQUEST END (used {model}) ==========")
            resp = make_response(response_json, 200)
            resp.headers['Content-Type'] = 'application/json'
            resp.headers['Content-Length'] = str(len(response_json))
            return resp
        
        last_error = error

    # All models failed
    logger.error(f"[ai/complete] All models failed. Last error: {last_error}")
    return jsonify({'error': 'All AI models failed', 'detail': last_error}), 504
