from flask import Blueprint, request, jsonify, make_response
import os
import requests
import json
import logging

logger = logging.getLogger('ai_proxy')

router = Blueprint('ai', __name__)

OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
OPENROUTER_MODEL = 'openrouter/free'

@router.route('/complete', methods=['POST'])
def ai_complete():
    """Proxy AI completion requests to OpenRouter securely."""
    data = request.get_json()
    prompt = data.get('prompt')

    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400

    api_key = os.environ.get('OPENROUTER_API_KEY')
    if not api_key:
        logger.error("OPENROUTER_API_KEY is missing in environment variables")
        return jsonify({'error': 'AI service not configured on server'}), 503

    try:
        logger.info(f"Forwarding AI request to OpenRouter (Prompt len: {len(prompt)})")

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}',
            'HTTP-Referer': os.environ.get('BACKEND_URL', 'http://localhost:5000'),
            'X-Title': 'MathMind AI Tutor',
        }

        payload = {
            'model': OPENROUTER_MODEL,
            'messages': [{'role': 'user', 'content': prompt}],
        }

        response = requests.post(
            f"{OPENROUTER_BASE_URL}/chat/completions",
            headers=headers,
            json=payload,
            timeout=30
        )

        if not response.ok:
            logger.error(f"OpenRouter error: {response.status_code} - {response.text}")
            return jsonify({
                'error': f'AI service returned an error ({response.status_code})',
                'detail': response.json() if response.headers.get('Content-Type') == 'application/json' else response.text
            }), response.status_code

        # Parse the response and extract the completion text
        response_data = response.json()
        logger.info(f"[ai/complete] Raw OpenRouter response: {str(response_data)[:500]}")

        # Extract the actual completion text from the nested response structure
        try:
            completion_text = response_data['choices'][0]['message']['content']
        except (KeyError, IndexError) as e:
            logger.error(f"[ai/complete] Failed to parse response structure: {e}, data: {response_data}")
            return jsonify({'error': 'Invalid response format from AI service', 'detail': str(e)}), 500

        result = {'completion': completion_text}
        response_json = json.dumps(result)
        logger.info(f"[ai/complete] Returning: {response_json[:200]}")

        # Use make_response to ensure proper response handling with SocketIO
        resp = make_response(response_json, 200)
        resp.headers['Content-Type'] = 'application/json'
        resp.headers['Content-Length'] = str(len(response_json))
        return resp

    except requests.exceptions.Timeout:
        logger.error("AI request timed out")
        return jsonify({'error': 'AI request timed out'}), 504
    except Exception as e:
        logger.error(f"Unexpected error in AI proxy: {e}")
        return jsonify({'error': str(e)}), 500
