import rp from 'request-promise-native';

const api = {};

async function requestAsync(actionUrl, options = {}) {
  let resp;
  try {
    resp = await rp({
      simple: false,
      resolveWithFullResponse: true,
      url: `${DI.config.api.url}${actionUrl}`,
      auth: {
        user: DI.config.api.credential.username,
        pass: DI.config.api.credential.password,
      },
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
      json: true,
      gzip: true,
      ...options,
    });
  } catch (err) {
    throw new Error(`Failed to connect to Portal API service: ${err.message}`);
  }
  const { body } = resp;
  if (body.err) {
    throw new Error(`Portal API request failed: ${body.name}: ${body.msg}`);
  }
  return body;
}

api.getLimits = () => {
  return requestAsync('/submission/api/limits', { method: 'GET' });
};

api.compileBegin = (task) => {
  return requestAsync('/submission/api/compileBegin', {
    method: 'POST',
    body: task,
  });
};

api.compileEnd = (task, text, success, lzmaBuffer) => {
  const body = {
    ...task,
    text,
    success: String(success),
  };
  if (success && lzmaBuffer) {
    body.binary = {
      value: lzmaBuffer,
      options: {
        filename: task.id,
        contentType: 'application/x-xz',
      },
    };
  }
  return requestAsync('/submission/api/compileEnd', {
    method: 'POST',
    formData: body,
  });
};

api.compileError = (task, text) => {
  return requestAsync('/submission/api/compileError', {
    method: 'POST',
    body: { ...task, text },
  });
};

export default api;
