from flask import Blueprint, request, jsonify, make_response
import os
import requests
import json
import logging

logger = logging.getLogger('ai_proxy')

router = Blueprint('ai', __name__)

OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
OPENROUTER_MODEL = os.environ.get('OPENROUTER_MODEL', 'openai/gpt-oss-120b,google/gemini-2.0-flash-001,qwen/qwen3-235b-a22b-thinking-2507')

@router.route('/complete', methods=['POST'])
def ai_complete():
    """Proxy AI completion requests to OpenRouter securely."""
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

    try:
        logger.info(f"[ai/complete] Forwarding AI request to OpenRouter")

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}',
            'HTTP-Referer': os.environ.get('BACKEND_URL', 'http://localhost:5000'),
            'X-Title': 'MathMind AI Tutor',
        }

        payload = {
            'model': OPENROUTER_MODEL,
            'messages': [{'role': 'user', 'content': prompt}],
            'stream': False,  # CRITICAL: disable streaming
        }

        logger.info(f"[ai/complete] Sending request to OpenRouter with payload: model={OPENROUTER_MODEL}, stream=False")

        response = requests.post(
            f"{OPENROUTER_BASE_URL}/chat/completions",
            headers=headers,
            json=payload,
            stream=False,  # CRITICAL: do not stream the response
            timeout=60  # Increased timeout for slow first tokens
        )

        logger.info(f"[ai/complete] OpenRouter response status: {response.status_code}")
        logger.info(f"[ai/complete] OpenRouter response headers: {dict(response.headers)}")
        logger.info(f"[ai/complete] OpenRouter response raw text (first 500 chars): {response.text[:500]}")

        if not response.ok:
            logger.error(f"OpenRouter error: {response.status_code} - {response.text}")
            return jsonify({
                'error': f'AI service returned an error ({response.status_code})',
                'detail': response.json() if response.headers.get('Content-Type') == 'application/json' else response.text
            }), response.status_code

        # Parse the response and extract the completion text
        try:
            response_data = response.json()
        except json.JSONDecodeError as e:
            logger.error(f"[ai/complete] Failed to parse JSON response: {e}")
            logger.error(f"[ai/complete] Raw response text: {response.text}")
            return jsonify({'error': 'Invalid JSON from AI service', 'detail': str(e)}), 500

        logger.info(f"[ai/complete] Parsed JSON response: {str(response_data)[:500]}")

        # Extract the actual completion text from the nested response structure
        try:
            completion_text = response_data['choices'][0]['message']['content']
        except (KeyError, IndexError) as e:
            logger.error(f"[ai/complete] Failed to parse response structure: {e}, data: {response_data}")
            return jsonify({'error': 'Invalid response format from AI service', 'detail': str(e)}), 500

        result = {'completion': completion_text}
        response_json = json.dumps(result)
        logger.info(f"[ai/complete] Returning response: {response_json[:200]}")
        logger.info(f"[ai/complete] Response JSON length: {len(response_json)}")
        logger.info(f"[ai/complete] ========== REQUEST END ==========")

        # Use make_response to ensure proper response handling with SocketIO
        resp = make_response(response_json, 200)
        resp.headers['Content-Type'] = 'application/json'
        resp.headers['Content-Length'] = str(len(response_json))
        return resp

    except requests.exceptions.Timeout:
        logger.error("AI request timed out")
        return jsonify({'error': 'AI request timed out'}), 504
    except Exception as e:
        logger.error(f"Unexpected error in AI proxy: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
