/** Открытые авторские фрагменты. Quiz и fixtures формативны; серверный grading отключён. */
import type { PracticeExercise, PracticeTopic } from './catalog.ts';

type Code = Pick<PracticeExercise, 'starter' | 'solution'>;
type Scenario = { title: string; task: string; input: Record<string, number | number[]>; output: number[]; question: string; answers: [string, string, string]; why: string };
const domain = 'Все числовые входы конечны и по модулю ≤10000; векторы содержат не более 256 элементов. Неверный тип или область: ValueError/TypeError в Python, RangeError в JavaScript, InputError в Rust. Вход не изменять. Ответ — новый вектор в указанном порядке; atol=1e−12, rtol=1e−10.';

// Небольшая упаковка авторского текста; не интерпретатор и не runner ученического кода.
function code(name: string, arguments_: string[], bodies: [string, string, string]): Code {
  const names = arguments_.map(x => x.replace('[]', ''));
  const vectors = arguments_.filter(x => x.endsWith('[]')).map(x => x.slice(0, -2));
  const scalars = names.filter(x => !vectors.includes(x));
  const pyChecks = [...vectors.map(x => `if not isinstance(${x}, (list, tuple)) or len(${x}) > 256:\n    raise ValueError("Некорректный вектор ${x}")`),
    `if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or abs(v) > 10000 for v in [${[...scalars, ...vectors.map(x => '*' + x)].join(', ')}]):\n    raise ValueError("Некорректные числа")`].join('\n');
  const jsChecks = [...vectors.map(x => `if (!Array.isArray(${x}) || ${x}.length > 256) throw new RangeError("Некорректный вектор");`),
    `if ([${[...scalars, ...vectors.map(x => '...' + x)].join(',')}].some(v => typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 10000)) throw new RangeError("Некорректные числа");`].join('\n');
  const rsChecks = [...vectors.map(x => `if ${x}.len() > 256 || ${x}.iter().any(|v| !v.is_finite() || v.abs() > 10000.0) { return Err(InputError::InvalidInput); }`),
    ...(scalars.length ? [`if [${scalars.join(',')}].iter().any(|v| !v.is_finite() || v.abs() > 10000.0) { return Err(InputError::InvalidInput); }`] : [])].join('\n');
  const py = (body: string) => `import math\n\ndef ${name}(${arguments_.map(x => `${x.replace('[]', '')}: ${x.endsWith('[]') ? 'list[float]' : 'float'}`).join(', ')}) -> list[float]:\n${body.split('\n').map(x => '    ' + x).join('\n')}\n`;
  const js = (body: string) => `function ${name}(${names.join(', ')}) {\n${body.split('\n').map(x => '  ' + x).join('\n')}\n}\n`;
  const rs = (body: string) => `#[derive(Debug, PartialEq)]\npub enum InputError { InvalidInput }\npub fn ${name}(${arguments_.map(x => `${x.replace('[]', '')}: ${x.endsWith('[]') ? '&[f64]' : 'f64'}`).join(', ')}) -> Result<Vec<f64>, InputError> {\n${body.split('\n').map(x => '    ' + x).join('\n')}\n}\n`;
  return {
    starter: { python: py('raise NotImplementedError("Реализуйте формулу и проверку входа")'), javascript: js('throw new Error("Реализуйте формулу и проверку входа");'), rust: rs('todo!("Реализуйте формулу и проверку входа")') },
    solution: { python: py(pyChecks + '\n' + bodies[0]), javascript: js(jsChecks + '\n' + bodies[1]), rust: rs(rsChecks + '\n' + bodies[2]) },
  };
}
function topic(id: string, title: string, chapter: number, prerequisites: string[], contract: string, formula: string, hints: string[], samples: Code, scenarios: [Scenario, Scenario, Scenario]): PracticeTopic {
  return { id, lessonId: id.split('.')[1], title, sourceSection: `chapter ${chapter} · отдельный фрагмент`, prerequisites,
    exercises: scenarios.map((s, i) => ({ id: `${id}.${['guided','transfer-a','transfer-b'][i]}`, topicId: id, title: `${['По шагам','Перенос A','Перенос B'][i]} · ${s.title}`, mode: i === 0 ? 'guided' : 'transfer',
      prompt: `${s.task} ${contract} ${domain} Реализуйте функцию для всех допустимых входов; открытый пример не является полным решением.`, formula, hints,
      explanation: `${s.why} ${contract}`, ...samples, fixtures: [{ input: JSON.stringify(s.input), output: JSON.stringify(s.output) }],
      quiz: { question: s.question, options: s.answers, correctIndex: 0, explanation: s.why },
    })) };
}
const s = (title: string, task: string, input: Scenario['input'], output: number[], question: string, answers: Scenario['answers'], why: string): Scenario => ({title,task,input,output,question,answers,why});

const gaussian = code('gaussian_parameters', ['mu','log_var'], [
  'if not -20 <= log_var <= 20:\n    raise ValueError("log_var вне [-20,20]")\nreturn [mu, math.exp(log_var), math.exp(log_var / 2)]',
  'if (log_var < -20 || log_var > 20) throw new RangeError("log_var");\nreturn [mu, Math.exp(log_var), Math.exp(log_var / 2)];',
  'if !(-20.0..=20.0).contains(&log_var) { return Err(InputError::InvalidInput); }\nOk(vec![mu, log_var.exp(), (log_var / 2.0).exp()])',
]);
const reparameterize = code('latent_sample_kl', ['mu','log_var','epsilon'], [
  'if not -20 <= log_var <= 20:\n    raise ValueError("log_var")\nsd = math.exp(log_var / 2)\nreturn [mu + sd * epsilon, 0.5 * (mu * mu + math.expm1(log_var) - log_var), 1.0, sd * epsilon / 2]',
  'if (log_var < -20 || log_var > 20) throw new RangeError("log_var");\nconst sd = Math.exp(log_var / 2);\nreturn [mu + sd * epsilon, .5 * (mu * mu + Math.expm1(log_var) - log_var), 1, sd * epsilon / 2];',
  'if !(-20.0..=20.0).contains(&log_var) { return Err(InputError::InvalidInput); }\nlet sd = (log_var / 2.0).exp();\nOk(vec![mu + sd * epsilon, 0.5 * (mu * mu + log_var.exp_m1() - log_var), 1.0, sd * epsilon / 2.0])',
]);
const vaeGradient = code('vae_local_gradient', ['mu','log_var','w','b','x','epsilon','beta'], [
  'if not -20 <= log_var <= 20 or beta < 0:\n    raise ValueError("log_var или beta")\nsd = math.exp(log_var / 2)\nz = mu + sd * epsilon\ne = w * z + b - x\nkl = 0.5 * (mu * mu + math.expm1(log_var) - log_var)\nloss = 0.5 * e * e + beta * kl\nreturn [loss, e * w + beta * mu, e * w * sd * epsilon / 2 + beta * math.expm1(log_var) / 2, e * z, e]',
  'if (log_var < -20 || log_var > 20 || beta < 0) throw new RangeError("log_var или beta");\nconst sd = Math.exp(log_var / 2), z = mu + sd * epsilon, e = w * z + b - x;\nconst kl = .5 * (mu * mu + Math.expm1(log_var) - log_var);\nreturn [.5 * e * e + beta * kl, e * w + beta * mu, e * w * sd * epsilon / 2 + beta * Math.expm1(log_var) / 2, e * z, e];',
  'if !(-20.0..=20.0).contains(&log_var) || beta < 0.0 { return Err(InputError::InvalidInput); }\nlet sd = (log_var / 2.0).exp();\nlet z = mu + sd * epsilon;\nlet e = w * z + b - x;\nlet kl = 0.5 * (mu * mu + log_var.exp_m1() - log_var);\nOk(vec![0.5 * e * e + beta * kl, e * w + beta * mu, e * w * sd * epsilon / 2.0 + beta * log_var.exp_m1() / 2.0, e * z, e])',
]);
const decoder = code('decoder_sample', ['z','w','b','sigma','epsilon'], [
  'if sigma <= 0:\n    raise ValueError("sigma > 0")\nmean = w * z + b\nreturn [mean, mean + sigma * epsilon]',
  'if (sigma <= 0) throw new RangeError("sigma > 0");\nconst mean = w * z + b;\nreturn [mean, mean + sigma * epsilon];',
  'if sigma <= 0.0 { return Err(InputError::InvalidInput); }\nlet mean = w * z + b;\nOk(vec![mean, mean + sigma * epsilon])',
]);
const latentSummary = code('posterior_moments', ['mu[]','sigma[]'], [
  'if not mu or len(mu) != len(sigma) or any(v <= 0 for v in sigma):\n    raise ValueError("Формы и sigma > 0")\nmean = sum(mu) / len(mu)\nvariance = sum(sd * sd + (m - mean) ** 2 for m, sd in zip(mu, sigma)) / len(mu)\nreturn [mean, variance]',
  'if (!mu.length || mu.length !== sigma.length || sigma.some(v => v <= 0)) throw new RangeError("Формы и sigma");\nconst mean = mu.reduce((a,b) => a+b, 0) / mu.length;\nreturn [mean, mu.reduce((a,m,i) => a + sigma[i] ** 2 + (m-mean) ** 2, 0) / mu.length];',
  'if mu.is_empty() || mu.len() != sigma.len() || sigma.iter().any(|v| *v <= 0.0) { return Err(InputError::InvalidInput); }\nlet mean = mu.iter().sum::<f64>() / mu.len() as f64;\nlet variance = mu.iter().zip(sigma).map(|(m,s)| s*s + (m-mean).powi(2)).sum::<f64>() / mu.len() as f64;\nOk(vec![mean, variance])',
]);
const ganForward = code('affine_gan_forward', ['z','g','b','d','c'], [
  'fake = g * z + b\nlogit = d * fake + c\np = 1 / (1 + math.exp(-logit)) if logit >= 0 else math.exp(logit) / (1 + math.exp(logit))\nreturn [fake, logit, p]',
  'const fake = g*z+b, logit = d*fake+c;\nconst p = logit >= 0 ? 1/(1+Math.exp(-logit)) : Math.exp(logit)/(1+Math.exp(logit));\nreturn [fake, logit, p];',
  'let fake = g*z+b; let logit = d*fake+c;\nlet p = if logit >= 0.0 { 1.0/(1.0+(-logit).exp()) } else { logit.exp()/(1.0+logit.exp()) };\nOk(vec![fake, logit, p])',
]);
const ganGradient = code('frozen_discriminator_gradient', ['z','g','b','d','c'], [
  'fake = g * z + b\na = d * fake + c\nloss = max(-a, 0) + math.log1p(math.exp(-abs(a)))\nq = -math.exp(-a) / (1 + math.exp(-a)) if a >= 0 else -1 / (1 + math.exp(a))\nreturn [loss, q * d * z, q * d]',
  'const fake = g*z+b, a = d*fake+c;\nconst loss = Math.max(-a,0)+Math.log1p(Math.exp(-Math.abs(a)));\nconst q = a >= 0 ? -Math.exp(-a)/(1+Math.exp(-a)) : -1/(1+Math.exp(a));\nreturn [loss,q*d*z,q*d];',
  'let fake = g*z+b; let a = d*fake+c;\nlet loss = (-a).max(0.0)+(-a.abs()).exp().ln_1p();\nlet q = if a >= 0.0 { -(-a).exp()/(1.0+(-a).exp()) } else { -1.0/(1.0+a.exp()) };\nOk(vec![loss,q*d*z,q*d])',
]);
const alternating = code('affine_gan_step', ['parameters[]','real','z','eta_d','eta_g'], [
  'if len(parameters) != 4 or not 0 <= eta_d <= 1 or not 0 <= eta_g <= 1:\n    raise ValueError("Четыре параметра и шаги [0,1]")\ng,b,d,c = parameters\ndef sigmoid(a):\n    return 1/(1+math.exp(-a)) if a >= 0 else math.exp(a)/(1+math.exp(a))\nfake = g*z+b\nr = -sigmoid(-(d*real+c))\nf = sigmoid(d*fake+c)\nd_new = d-eta_d*(r*real+f*fake)\nc_new = c-eta_d*(r+f)\nq = -sigmoid(-(d_new*fake+c_new))*d_new\nreturn [g-eta_g*q*z, b-eta_g*q, d_new, c_new]',
  'if (parameters.length !== 4 || eta_d < 0 || eta_d > 1 || eta_g < 0 || eta_g > 1) throw new RangeError("Параметры или шаг");\nconst [g,b,d,c] = parameters;\nconst sigmoid = a => a >= 0 ? 1/(1+Math.exp(-a)) : Math.exp(a)/(1+Math.exp(a));\nconst fake = g*z+b, r = -sigmoid(-(d*real+c)), f = sigmoid(d*fake+c);\nconst dn = d-eta_d*(r*real+f*fake), cn = c-eta_d*(r+f);\nconst q = -sigmoid(-(dn*fake+cn))*dn;\nreturn [g-eta_g*q*z,b-eta_g*q,dn,cn];',
  'if parameters.len() != 4 || !(0.0..=1.0).contains(&eta_d) || !(0.0..=1.0).contains(&eta_g) { return Err(InputError::InvalidInput); }\nlet (g,b,d,c) = (parameters[0],parameters[1],parameters[2],parameters[3]);\nlet sigmoid = |a:f64| if a >= 0.0 {1.0/(1.0+(-a).exp())} else {a.exp()/(1.0+a.exp())};\nlet fake = g*z+b; let r = -sigmoid(-(d*real+c)); let f = sigmoid(d*fake+c);\nlet dn = d-eta_d*(r*real+f*fake); let cn = c-eta_d*(r+f);\nlet q = -sigmoid(-(dn*fake+cn))*dn;\nOk(vec![g-eta_g*q*z,b-eta_g*q,dn,cn])',
]);
const diversity = code('two_region_coverage', ['samples[]'], [
  'if not samples:\n    raise ValueError("Пустая выборка")\nleft = sum(-1.5 <= v <= -0.5 for v in samples)\nright = sum(0.5 <= v <= 1.5 for v in samples)\nmean = sum(samples)/len(samples)\nreturn [float(left), float(right), (int(left > 0)+int(right > 0))/2, sum((v-mean)**2 for v in samples)/len(samples)]',
  'if (!samples.length) throw new RangeError("Пустая выборка");\nconst left = samples.filter(v => v >= -1.5 && v <= -.5).length, right = samples.filter(v => v >= .5 && v <= 1.5).length;\nconst mean = samples.reduce((a,b)=>a+b,0)/samples.length;\nreturn [left,right,(Number(left>0)+Number(right>0))/2,samples.reduce((a,v)=>a+(v-mean)**2,0)/samples.length];',
  'if samples.is_empty() { return Err(InputError::InvalidInput); }\nlet left = samples.iter().filter(|v| (-1.5..=-0.5).contains(*v)).count();\nlet right = samples.iter().filter(|v| (0.5..=1.5).contains(*v)).count();\nlet mean = samples.iter().sum::<f64>()/samples.len() as f64;\nOk(vec![left as f64,right as f64,((left>0) as u8+(right>0) as u8) as f64/2.0,samples.iter().map(|v|(v-mean).powi(2)).sum::<f64>()/samples.len() as f64])',
]);
const critic = code('critic_objective', ['real_scores[]','fake_scores[]'], [
  'if not real_scores or not fake_scores:\n    raise ValueError("Пустая выборка")\nr = sum(real_scores)/len(real_scores)\nf = sum(fake_scores)/len(fake_scores)\nreturn [f-r, -f]',
  'if (!real_scores.length || !fake_scores.length) throw new RangeError("Пустая выборка");\nconst r = real_scores.reduce((a,b)=>a+b,0)/real_scores.length, f = fake_scores.reduce((a,b)=>a+b,0)/fake_scores.length;\nreturn [f-r,-f];',
  'if real_scores.is_empty() || fake_scores.is_empty() { return Err(InputError::InvalidInput); }\nlet r = real_scores.iter().sum::<f64>()/real_scores.len() as f64;\nlet f = fake_scores.iter().sum::<f64>()/fake_scores.len() as f64;\nOk(vec![f-r,-f])',
]);
const forwardNoise = code('scheduled_noise', ['betas[]','x0','epsilon'], [
  'if any(not 0 < b < 1 for b in betas):\n    raise ValueError("beta в (0,1)")\nbar = math.prod(1-b for b in betas)\nreturn [bar, math.sqrt(bar)*x0 + math.sqrt(1-bar)*epsilon]',
  'if (betas.some(b => b <= 0 || b >= 1)) throw new RangeError("beta");\nconst bar = betas.reduce((a,b)=>a*(1-b),1);\nreturn [bar,Math.sqrt(bar)*x0+Math.sqrt(1-bar)*epsilon];',
  'if betas.iter().any(|b| *b <= 0.0 || *b >= 1.0) { return Err(InputError::InvalidInput); }\nlet bar: f64 = betas.iter().map(|b|1.0-b).product();\nOk(vec![bar,bar.sqrt()*x0+(1.0-bar).sqrt()*epsilon])',
]);
const noiseGradient = code('epsilon_mse_gradient', ['predicted[]','epsilon[]'], [
  'if not predicted or len(predicted) != len(epsilon):\n    raise ValueError("Формы")\ne = [p-t for p,t in zip(predicted,epsilon)]\nreturn [sum(v*v for v in e)/len(e)] + [2*v/len(e) for v in e]',
  'if (!predicted.length || predicted.length !== epsilon.length) throw new RangeError("Формы");\nconst e = predicted.map((p,i)=>p-epsilon[i]);\nreturn [e.reduce((a,v)=>a+v*v,0)/e.length,...e.map(v=>2*v/e.length)];',
  'if predicted.is_empty() || predicted.len() != epsilon.len() { return Err(InputError::InvalidInput); }\nlet e: Vec<f64> = predicted.iter().zip(epsilon).map(|(p,t)|p-t).collect();\nlet n = e.len() as f64;\nlet mut out = vec![e.iter().map(|v|v*v).sum::<f64>()/n];\nout.extend(e.iter().map(|v|2.0*v/n));\nOk(out)',
]);
const ddpm = code('ddpm_scalar_step', ['beta','previous_bar','xt','epsilon','noise'], [
  'if not 1e-6 <= beta <= 1-1e-6 or not 1e-6 <= previous_bar <= 1:\n    raise ValueError("Schedule")\nalpha = 1-beta\nbar = alpha*previous_bar\nmean = (xt-beta*epsilon/math.sqrt(1-bar))/math.sqrt(alpha)\nvariance = beta*(1-previous_bar)/(1-bar)\nreturn [mean,variance,mean+math.sqrt(variance)*noise]',
  'if (beta < 1e-6 || beta > 1-1e-6 || previous_bar < 1e-6 || previous_bar > 1) throw new RangeError("Schedule");\nconst alpha = 1-beta, bar = alpha*previous_bar;\nconst mean = (xt-beta*epsilon/Math.sqrt(1-bar))/Math.sqrt(alpha), variance = beta*(1-previous_bar)/(1-bar);\nreturn [mean,variance,mean+Math.sqrt(variance)*noise];',
  'if beta < 1e-6 || beta > 1.0-1e-6 || previous_bar < 1e-6 || previous_bar > 1.0 { return Err(InputError::InvalidInput); }\nlet alpha = 1.0-beta; let bar = alpha*previous_bar;\nlet mean = (xt-beta*epsilon/(1.0-bar).sqrt())/alpha.sqrt();\nlet variance = beta*(1.0-previous_bar)/(1.0-bar);\nOk(vec![mean,variance,mean+variance.sqrt()*noise])',
]);
const ddim = code('ddim_deterministic_step', ['bar','earlier_bar','xt','epsilon'], [
  'if not 0 < bar < earlier_bar <= 1:\n    raise ValueError("0 < bar < earlier_bar <= 1")\nx0 = (xt-math.sqrt(1-bar)*epsilon)/math.sqrt(bar)\nreturn [x0,math.sqrt(earlier_bar)*x0+math.sqrt(1-earlier_bar)*epsilon]',
  'if (!(bar > 0 && bar < earlier_bar && earlier_bar <= 1)) throw new RangeError("Schedule order");\nconst x0 = (xt-Math.sqrt(1-bar)*epsilon)/Math.sqrt(bar);\nreturn [x0,Math.sqrt(earlier_bar)*x0+Math.sqrt(1-earlier_bar)*epsilon];',
  'if !(bar > 0.0 && bar < earlier_bar && earlier_bar <= 1.0) { return Err(InputError::InvalidInput); }\nlet x0 = (xt-(1.0-bar).sqrt()*epsilon)/bar.sqrt();\nOk(vec![x0,earlier_bar.sqrt()*x0+(1.0-earlier_bar).sqrt()*epsilon])',
]);
const guidance = code('classifier_free_guidance', ['unconditional[]','conditional[]','scale'], [
  'if not unconditional or len(unconditional) != len(conditional) or not 0 <= scale <= 20:\n    raise ValueError("Формы или scale")\nreturn [u+scale*(c-u) for u,c in zip(unconditional,conditional)]',
  'if (!unconditional.length || unconditional.length !== conditional.length || scale < 0 || scale > 20) throw new RangeError("Формы или scale");\nreturn unconditional.map((u,i)=>u+scale*(conditional[i]-u));',
  'if unconditional.is_empty() || unconditional.len() != conditional.len() || !(0.0..=20.0).contains(&scale) { return Err(InputError::InvalidInput); }\nOk(unconditional.iter().zip(conditional).map(|(u,c)|u+scale*(c-u)).collect())',
]);

// Adjacency contract here: simple undirected graph, binary entries, diagonal may already be 1.
// Adding a self loop means ensuring one loop (set diagonal to 1), never adding a duplicate.
const graphPy = 'n = math.isqrt(len(adjacency))\nif n == 0 or n*n != len(adjacency) or any(v not in (0,1) for v in adjacency) or any(adjacency[i*n+j] != adjacency[j*n+i] for i in range(n) for j in range(n)):\n    raise ValueError("Нужен простой неориентированный граф")\na = [[1.0 if i == j else adjacency[i*n+j] for j in range(n)] for i in range(n)]\nd = [sum(row) for row in a]';
const graphJs = 'const n = Math.sqrt(adjacency.length);\nif (!n || !Number.isInteger(n) || adjacency.some(v=>v!==0 && v!==1) || adjacency.some((v,k)=>v!==adjacency[(k%n)*n+Math.floor(k/n)])) throw new RangeError("Простой граф");\nconst a = Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j ? 1 : adjacency[i*n+j]));\nconst d = a.map(row=>row.reduce((s,v)=>s+v,0));';
const graphRs = 'let n = (adjacency.len() as f64).sqrt() as usize;\nif n == 0 || n*n != adjacency.len() || adjacency.iter().any(|v| *v != 0.0 && *v != 1.0) || (0..n).any(|i|(0..n).any(|j|adjacency[i*n+j] != adjacency[j*n+i])) { return Err(InputError::InvalidInput); }\nlet a: Vec<Vec<f64>> = (0..n).map(|i|(0..n).map(|j|if i==j {1.0} else {adjacency[i*n+j]}).collect()).collect();\nlet d: Vec<f64> = a.iter().map(|row|row.iter().sum()).collect();';
const degrees = code('self_loop_degrees', ['adjacency[]'], [graphPy+'\nreturn d',graphJs+'\nreturn d;',graphRs+'\nOk(d)']);
const aggregation = code('symmetric_aggregate', ['adjacency[]','features[]'], [
  graphPy+'\nif len(features) != n:\n    raise ValueError("Один feature на узел")\nreturn [sum(a[i][j]*features[j]/math.sqrt(d[i]*d[j]) for j in range(n)) for i in range(n)]',
  graphJs+'\nif (features.length !== n) throw new RangeError("Features");\nreturn a.map((row,i)=>row.reduce((sum,v,j)=>sum+v*features[j]/Math.sqrt(d[i]*d[j]),0));',
  graphRs+'\nif features.len() != n { return Err(InputError::InvalidInput); }\nOk((0..n).map(|i|(0..n).map(|j|a[i][j]*features[j]/(d[i]*d[j]).sqrt()).sum()).collect())',
]);
const maskedCe = code('masked_binary_ce', ['logits[]','labels[]','mask[]'], [
  'if not logits or len(labels) != len(logits) or len(mask) != len(logits) or any(v not in (0,1) for v in labels+mask) or sum(mask) == 0:\n    raise ValueError("Формы, бинарные метки/mask, непустой train")\nn = sum(mask)\nloss = 0.0\ngrad = []\nfor z,y,m in zip(logits,labels,mask):\n    loss += m*(max(z,0)-y*z+math.log1p(math.exp(-abs(z))))/n\n    p = 1/(1+math.exp(-z)) if z >= 0 else math.exp(z)/(1+math.exp(z))\n    q = -1/(1+math.exp(z)) if z <= 0 else -math.exp(-z)/(1+math.exp(-z))\n    grad.append(m*(q if y == 1 else p)/n)\nreturn [loss]+grad',
  'if (!logits.length || labels.length !== logits.length || mask.length !== logits.length || [...labels,...mask].some(v=>v!==0 && v!==1) || !mask.some(v=>v===1)) throw new RangeError("Формы, labels, mask");\nconst n = mask.reduce((a,b)=>a+b,0);\nconst loss = logits.reduce((a,z,i)=>a+mask[i]*(Math.max(z,0)-labels[i]*z+Math.log1p(Math.exp(-Math.abs(z))))/n,0);\nreturn [loss,...logits.map((z,i)=>{const p=z>=0?1/(1+Math.exp(-z)):Math.exp(z)/(1+Math.exp(z));const q=z<=0?-1/(1+Math.exp(z)):-Math.exp(-z)/(1+Math.exp(-z));return mask[i]*(labels[i]===1?q:p)/n;})];',
  'if logits.is_empty() || labels.len()!=logits.len() || mask.len()!=logits.len() || labels.iter().chain(mask).any(|v|*v!=0.0 && *v!=1.0) || !mask.contains(&1.0) { return Err(InputError::InvalidInput); }\nlet n: f64 = mask.iter().sum();\nlet loss: f64 = logits.iter().enumerate().map(|(i,z)|mask[i]*(z.max(0.0)-labels[i]*z+(-z.abs()).exp().ln_1p())/n).sum();\nlet mut out = vec![loss];\nout.extend(logits.iter().enumerate().map(|(i,z)|{let p=if *z>=0.0 {1.0/(1.0+(-z).exp())} else {z.exp()/(1.0+z.exp())}; let q=if *z<=0.0 {-1.0/(1.0+z.exp())} else {-(-z).exp()/(1.0+(-z).exp())};mask[i]*(if labels[i]==1.0 {q} else {p})/n}));\nOk(out)',
]);
const smoothing = code('repeat_smoothing', ['adjacency[]','features[]','steps'], [
  graphPy+'\nif len(features) != n or steps != int(steps) or not 0 <= steps <= 100:\n    raise ValueError("Features или steps")\nh = list(features)\nfor _ in range(int(steps)):\n    h = [sum(a[i][j]*h[j]/math.sqrt(d[i]*d[j]) for j in range(n)) for i in range(n)]\nreturn h',
  graphJs+'\nif (features.length !== n || !Number.isInteger(steps) || steps < 0 || steps > 100) throw new RangeError("Features или steps");\nlet h = [...features];\nfor (let k=0;k<steps;k++) h=a.map((row,i)=>row.reduce((sum,v,j)=>sum+v*h[j]/Math.sqrt(d[i]*d[j]),0));\nreturn h;',
  graphRs+'\nif features.len()!=n || steps.fract()!=0.0 || !(0.0..=100.0).contains(&steps) { return Err(InputError::InvalidInput); }\nlet mut h=features.to_vec();\nfor _ in 0..steps as usize {h=(0..n).map(|i|(0..n).map(|j|a[i][j]*h[j]/(d[i]*d[j]).sqrt()).sum()).collect();}\nOk(h)',
]);
const sage = code('graphsage_mean_concat', ['self_feature','neighbors[]'], [
  'mean = sum(neighbors)/len(neighbors) if neighbors else self_feature\nreturn [self_feature,mean]',
  'const mean = neighbors.length ? neighbors.reduce((a,b)=>a+b,0)/neighbors.length : self_feature;\nreturn [self_feature,mean];',
  'let mean = if neighbors.is_empty() {self_feature} else {neighbors.iter().sum::<f64>()/neighbors.len() as f64};\nOk(vec![self_feature,mean])',
]);
const returns = code('discounted_return', ['rewards[]','gamma'], [
  'if not 0 <= gamma <= 1:\n    raise ValueError("gamma")\nvalue = 0.0\nfor r in reversed(rewards):\n    value = r+gamma*value\nreturn [value]',
  'if (gamma < 0 || gamma > 1) throw new RangeError("gamma");\nlet value = 0;\nfor (let i=rewards.length-1;i>=0;i--) value=rewards[i]+gamma*value;\nreturn [value];',
  'if !(0.0..=1.0).contains(&gamma) { return Err(InputError::InvalidInput); }\nOk(vec![rewards.iter().rev().fold(0.0,|v,r|r+gamma*v)])',
]);
const bellman = code('two_action_bellman', ['probabilities[]','rewards[]','next_values[]','terminal[]','gamma'], [
  'if any(len(v) != 4 for v in (probabilities,rewards,next_values,terminal)) or not 0 <= gamma <= 1 or any(p < 0 or p > 1 for p in probabilities) or any(t not in (0,1) for t in terminal) or any(abs(sum(probabilities[i:i+2])-1)>1e-12 for i in (0,2)):\n    raise ValueError("Два исхода для каждого из двух действий")\nq = [sum(probabilities[j]*(rewards[j]+gamma*next_values[j]*(1-terminal[j])) for j in range(i,i+2)) for i in (0,2)]\nreturn q+[max(q)]',
  'if ([probabilities,rewards,next_values,terminal].some(v=>v.length!==4) || gamma<0 || gamma>1 || probabilities.some(p=>p<0||p>1) || terminal.some(t=>t!==0&&t!==1) || [0,2].some(i=>Math.abs(probabilities[i]+probabilities[i+1]-1)>1e-12)) throw new RangeError("Два действия, два исхода");\nconst q=[0,2].map(i=>[i,i+1].reduce((v,j)=>v+probabilities[j]*(rewards[j]+gamma*next_values[j]*(1-terminal[j])),0));\nreturn [...q,Math.max(...q)];',
  'if [probabilities.len(),rewards.len(),next_values.len(),terminal.len()].iter().any(|n|*n!=4) || !(0.0..=1.0).contains(&gamma) || probabilities.iter().any(|p|*p<0.0||*p>1.0) || terminal.iter().any(|t|*t!=0.0&&*t!=1.0) || [0,2].iter().any(|i|(probabilities[*i]+probabilities[*i+1]-1.0).abs()>1e-12) { return Err(InputError::InvalidInput); }\nlet q: Vec<f64>=[0,2].iter().map(|i|(*i..*i+2).map(|j|probabilities[j]*(rewards[j]+gamma*next_values[j]*(1.0-terminal[j]))).sum()).collect();\nOk(vec![q[0],q[1],q[0].max(q[1])])',
]);
const qUpdate = code('q_transition_update', ['old','reward','next_max','gamma','eta','terminated','truncated'], [
  'if not 0 <= gamma <= 1 or not 0 <= eta <= 1 or terminated not in (0,1) or truncated not in (0,1):\n    raise ValueError("Шаг, discount или флаги")\ntarget = reward+gamma*next_max*(1-terminated)\nreturn [target,old+eta*(target-old)]',
  'if (gamma<0 || gamma>1 || eta<0 || eta>1 || ![0,1].includes(terminated) || ![0,1].includes(truncated)) throw new RangeError("Шаг, discount, flags");\nconst target=reward+gamma*next_max*(1-terminated);\nreturn [target,old+eta*(target-old)];',
  'if !(0.0..=1.0).contains(&gamma) || !(0.0..=1.0).contains(&eta) || (terminated!=0.0 && terminated!=1.0) || (truncated!=0.0 && truncated!=1.0) { return Err(InputError::InvalidInput); }\nlet target=reward+gamma*next_max*(1.0-terminated);\nOk(vec![target,old+eta*(target-old)])',
]);
const policy = code('bandit_policy_gradient', ['theta','left_reward','right_reward','baseline'], [
  'p = 1/(1+math.exp(-theta)) if theta >= 0 else math.exp(theta)/(1+math.exp(theta))\nleft = (left_reward-baseline)*(-p)\nright = (right_reward-baseline)*(1-p)\nexpected = (1-p)*left+p*right\nreturn [p, (1-p)*left_reward+p*right_reward, p*(1-p)*(right_reward-left_reward), expected, (1-p)*(left-expected)**2+p*(right-expected)**2]',
  'const p=theta>=0?1/(1+Math.exp(-theta)):Math.exp(theta)/(1+Math.exp(theta));\nconst left=(left_reward-baseline)*(-p), right=(right_reward-baseline)*(1-p), expected=(1-p)*left+p*right;\nreturn [p,(1-p)*left_reward+p*right_reward,p*(1-p)*(right_reward-left_reward),expected,(1-p)*(left-expected)**2+p*(right-expected)**2];',
  'let p=if theta>=0.0 {1.0/(1.0+(-theta).exp())} else {theta.exp()/(1.0+theta.exp())};\nlet left=(left_reward-baseline)*(-p); let right=(right_reward-baseline)*(1.0-p); let expected=(1.0-p)*left+p*right;\nOk(vec![p,(1.0-p)*left_reward+p*right_reward,p*(1.0-p)*(right_reward-left_reward),expected,(1.0-p)*(left-expected).powi(2)+p*(right-expected).powi(2)])',
]);
const ppo = code('ppo_clipped_term', ['ratio','advantage','epsilon'], [
  'if ratio <= 0 or not 0 <= epsilon < 1:\n    raise ValueError("ratio > 0, epsilon в [0,1)")\nclipped = min(max(ratio,1-epsilon),1+epsilon)\nreturn [min(ratio*advantage,clipped*advantage)]',
  'if (ratio<=0 || epsilon<0 || epsilon>=1) throw new RangeError("ratio или epsilon");\nconst clipped=Math.min(Math.max(ratio,1-epsilon),1+epsilon);\nreturn [Math.min(ratio*advantage,clipped*advantage)];',
  'if ratio<=0.0 || epsilon<0.0 || epsilon>=1.0 { return Err(InputError::InvalidInput); }\nlet clipped=ratio.max(1.0-epsilon).min(1.0+epsilon);\nOk(vec![(ratio*advantage).min(clipped*advantage)])',
]);

export const generativePracticeTopics: PracticeTopic[] = [
  topic('unit.vae.idea','Gaussian encoder: среднее, variance, sd',0,['concept.gaussian','concept.latent-variable'],
    'gaussian_parameters(mu,log_var) → [mu,variance,sd]; log_var∈[−20,20]. Это параметры уже вычисленного encoder; prior N(0,1) задаётся mu=0,log_var=0.',
    'variance=exp(ℓ); σ=exp(ℓ/2); q(z|x)=N(μ,σ²)', ['Не путайте log variance с log sd.','У prior mu=0 и variance=1; среднее не является выборкой.'],gaussian,[
      s('Стандартный prior','Вычислите параметры распределения при нулевых выходах encoder.',{mu:0,log_var:0},[0,1,1],'Чему равна σ при ℓ=0?',['1','0','e'],'exp(0)=1: нулевая log variance означает единичную variance.'),
      s('Та же mu, шире posterior','Измените только log variance на ln(4); объясните ширину posterior.',{mu:2,log_var:Math.log(4)},[2,4,2],'Во сколько раз выросла σ относительно ℓ=0?',['В 2','В 4','Не изменилась'],'Variance выросла до 4, её квадратный корень равен 2; mu осталась 2.'),
      s('Узкий posterior','Для отрицательной log variance найдите sd и сравните с prior.',{mu:-1,log_var:Math.log(.25)},[-1,.25,.5],'Какой mu у стандартного prior при генерации без x?',['0','−1','Зависит от последнего encoder'],'Стандартный prior имеет фиксированное mu=0; posterior конкретного x может иметь mu=−1.'),
    ]),
  topic('unit.vae.compute','Reparameterization и scalar Gaussian KL',1,['unit.vae.idea'],
    'latent_sample_kl(mu,log_var,epsilon) → [z,KL,dz/dmu,dz/dlog_var]. log_var∈[−20,20]; epsilon фиксирован и передан извне. Один latent, KL к N(0,1).',
    'z=μ+exp(ℓ/2)ε; KL=(μ²+expm1(ℓ)−ℓ)/2; ∂z/∂ℓ=σε/2', ['Используйте один epsilon в обеих точках finite difference.','expm1(ℓ) устойчивее exp(ℓ)−1 при малом ℓ.'],reparameterize,[
      s('Нулевой KL','Посчитайте z и две локальные производные для prior.',{mu:0,log_var:0,epsilon:2},[2,0,1,1],'Чему равен KL(q||prior), когда q=prior?',['0','1','2'],'При mu=0 и variance=1 все слагаемые KL взаимно сокращаются.'),
      s('Отрицательный шум','Сохраните epsilon=−2 и оцените знак производной по log variance.',{mu:1,log_var:0,epsilon:-2},[-1,.5,1,-1],'Знак dz/dlog_var при epsilon<0?',['Отрицательный','Положительный','Всегда ноль'],'Рост σ усиливает отрицательное смещение σε; KL=.5 из ненулевого mu.'),
      s('Другая variance','Вычислите KL и z при variance=4, затем проверьте dz/dlog_var центральной разностью.',{mu:0,log_var:Math.log(4),epsilon:1},[2,(3-Math.log(4))/2,1,1],'Что нужно фиксировать в двух forward для проверки derivative?',['epsilon','z','log_var'],'Проверяем зависимость z от log_var при одном epsilon; новый шум изменил бы проверяемую функцию.'),
    ]),
  topic('unit.vae.train','VAE: локальный backward по μ, ℓ, w, b',2,['unit.vae.compute'],
    'vae_local_gradient → [L,dmu,dlog_var,dw,db]. Decoder w*z+b, observation σ_x=1; постоянная log√(2π) опущена. log_var∈[−20,20], beta≥0. Это четыре локальные производные одного sample; encoder affine и batch update отдельно.',
    'L=(wz+b−x)²/2+β KL; dμ=e·w+βμ; dℓ=e·w·σε/2+β·expm1(ℓ)/2; dw=e·z; db=e', ['Сначала z, reconstruction, error; затем ветви NLL и KL.','Удерживайте epsilon фиксированным. Производные KL добавляются только в encoder-выходы.'],vaeGradient,[
      s('Две ветви loss','Найдите loss и четыре производные в указанном порядке.',{mu:1,log_var:0,w:2,b:0,x:1,epsilon:0,beta:1},[1,3,0,1,1],'Почему dmu=3?',['NLL даёт 2, KL даёт 1','Только KL','Это значение z'],'z=1, error=1; loss=.5+.5=1. NLL даёт e*w=2, KL даёт beta*mu=1. Складываем dmu=3.'),
      s('beta=0','Отключите KL и сохраните отрицательный epsilon; предскажите dlog_var.',{mu:0,log_var:0,w:1,b:0,x:0,epsilon:-1,beta:0},[.5,-1,.5,1,-1],'Может ли dlog_var остаться ненулевым при beta=0?',['Да, через reconstruction','Нет, это только KL','Только при epsilon=0'],'z=−1,error=−1; произведение e*w*σ*epsilon/2=.5. KL не единственный путь.'),
      s('Идеальная reconstruction','При нулевой ошибке увеличьте beta; найдите оставшиеся gradients.',{mu:2,log_var:0,w:1,b:0,x:2,epsilon:0,beta:2},[4,4,0,0,0],'Какая ветвь даёт ненулевой gradient здесь?',['KL по mu','Reconstruction по w','Decoder bias'],'Ошибка reconstruction нулевая, но KL=mu²/2=2; beta=2 даёт loss=4 и dmu=4.'),
    ]),
  topic('unit.vae.generate','Decoder mean и Gaussian sample',3,['unit.vae.idea'],
    'decoder_sample(z,w,b,sigma,epsilon) → [mean,sample]. sigma>0; latent z и observation epsilon переданы извне, случайный генератор не нужен.',
    'm=wz+b; x=m+σ_x ε_x', ['Отдельно вычислите decoder mean.','При epsilon=0 sample равен mean при любом допустимом sigma.'],decoder,[
      s('Среднее и шум','Сначала вычислите mean, затем добавьте шум decoder.',{z:2,w:3,b:1,sigma:.5,epsilon:2},[7,8],'Что меняет observation noise?',['Sample','Decoder mean','Latent z'],'Mean=7, шум=.5·2=1, sample=8. Среднее остаётся 7.'),
      s('Нулевой observation noise','Увеличьте sigma до 3, сохраняя epsilon=0.',{z:-1,w:2,b:1,sigma:3,epsilon:0},[-1,-1],'Равны ли mean и sample при epsilon=0?',['Да','Нет','Только при sigma=1'],'Добавляемое σ*0 равно нулю, хотя само распределение имеет ненулевую variance.'),
      s('Интерполяция latent','Возьмите midpoint z=0 между −2 и 2; вычислите декодирование с отрицательным шумом.',{z:0,w:2,b:1,sigma:2,epsilon:-.5},[1,0],'Доказывает ли гладкая интерполяция качество prior samples?',['Нет','Да, всегда','Да, если mean линейное'],'Линейное среднее даёт гладкую интерполяцию; покрытие prior и качество samples требуют отдельной проверки.'),
    ]),
  topic('unit.vae.limits','Агрегированный posterior: два момента',4,['unit.vae.idea','concept.variance'],
    'posterior_moments(mu,sigma) → [mean,variance] равновесной смеси Gaussian. Непустые равные длины, sigma_i>0. Это диагностика первых двух моментов, не тест равенства распределений или качество генерации.',
    'm=mean(μᵢ); Var(z)=mean(σᵢ²+(μᵢ−m)²)', ['Закон полной variance: внутри компоненты плюс между средними.','Средняя variance encoder сама по себе теряет разброс mu.'],latentSummary,[
      s('Внутри и между','Для двух posterior со средними ±1 сложите оба источника variance.',{mu:[-1,1],sigma:[1,1]},[0,2],'Полная variance здесь?',['2','1','0'],'Внутри каждой Gaussian variance=1, между средними ещё 1. Сумма 2.'),
      s('Смещённые codes','Одинаковые mu=3 имеют нулевой межкомпонентный разброс; сохраните внутреннюю variance.',{mu:[3,3],sigma:[.5,.5]},[3,.25],'Совпадает ли эта смесь со стандартным prior?',['Нет: mean=3','Да: mu одинаковы','Да: variance положительна'],'Mean=3 и variance=.25 отличаются от prior с mean=0,variance=1.'),
      s('Совпадение моментов','Проверьте симметричную смесь mu=±√.75 и sigma=.5.',{mu:[-Math.sqrt(.75),Math.sqrt(.75)],sigma:[.5,.5]},[0,1],'Доказывают ли mean=0,variance=1, что смесь N(0,1)?',['Нет','Да','Только при двух компонентах'],'Первые два момента могут совпасть при иной форме density; это диагностический предел данного фрагмента.'),
    ]),
  topic('unit.gan.game','Affine GAN: G(z) и D-logit',0,['concept.adversarial-game'],
    'affine_gan_forward(z,g,b,d,c) → [fake,logit,probability]. G=g*z+b; D=sigmoid(d*x+c). Здесь две affine модели; скрытые слои урока не реализуются.',
    'fake=gz+b; a=d·fake+c; D=σ(a)', ['Две группы параметров: [g,b] и [d,c].','Sigmoid применяется к D-logit, не к выходу G.'],ganForward,[
      s('Нейтральный D','Найдите fake и вероятность, когда logit D равен нулю.',{z:2,g:1,b:1,d:0,c:0},[3,0,.5],'Что означает D=.5?',['Нейтральный logit 0','Идеальный генератор доказан','Половина target modes покрыта'],'Sigmoid(0)=.5 независимо от sample; это не измерение coverage.'),
      s('Коллапс affine G','Обнулите g: найдите выход при другом z.',{z:-3,g:0,b:2,d:0,c:Math.log(3)},[2,Math.log(3),.75],'Зависит ли G от z при g=0?',['Нет','Да','Только при отрицательном z'],'G(z)=b=2 для любого z; высокая оценка D сама по себе не исключает collapse.'),
      s('Уверенный D','Вычислите stable sigmoid на большом отрицательном logit.',{z:1,g:1,b:0,d:-1000,c:0},[1,-1000,0],'Как устойчиво считать sigmoid при a<0?',['exp(a)/(1+exp(a))','exp(−a)/(1+exp(−a))','a/(1+a)'],'exp(a) не переполняется при отрицательном a; underflow вероятности к 0 здесь допустим.'),
    ]),
  topic('unit.gan.gradients','Non-saturating G через frozen affine D',1,['unit.gan.game','concept.chain-rule'],
    'frozen_discriminator_gradient(z,g,b,d,c) → [L_G,dg,db]. L_G=−log D(G(z)); параметры D не обновляются, но производная по его входу сохраняется.',
    'L_G=softplus(−a); q=−sigmoid(−a); dg=q·d·z; db=q·d', ['Frozen D означает неизменные d,c, а не stop-gradient по его входу.','Вычисляйте −sigmoid(−a) устойчиво, сохраняя малые производные.'],ganGradient,[
      s('Цепочка из трёх множителей','Проверьте gradient G при a=0.',{z:2,g:0,b:0,d:1,c:0},[Math.log(2),-1,-.5],'Какой gradient dg при q=−.5,d=1,z=2?',['−1','0','1'],'Через frozen D проходит q*d, затем множитель z от G. Получается −1.'),
      s('D без зависимости от x','Обнулите d и оставьте отрицательный logit c.',{z:2,g:1,b:0,d:0,c:-2},[Math.log1p(Math.exp(2)),0,0],'Почему gradient G нулевой?',['D не зависит от своего входа','Потому что D frozen','Потому что loss=0'],'При d=0 локальная derivative D-logit по fake равна 0; loss при этом положительная.'),
      s('Уверенно отвергнутый fake','Проверьте non-saturating gradient при logit −1000.',{z:1,g:0,b:0,d:1,c:-1000},[1000,-1,-1],'Исчезает ли этот non-saturating gradient при a≈−1000,d=1?',['Нет, q≈−1','Да, q≈0','Он становится положительным'],'Для non-saturating цели q=−sigmoid(−a)≈−1. Это отличается от saturating minimax цели.'),
    ]),
  topic('unit.gan.train','Одна пара D→G шагов affine GAN',2,['unit.gan.gradients'],
    'affine_gan_step(parameters,real,z,eta_d,eta_g) → новые [g,b,d,c]. parameters имеет длину 4; оба eta∈[0,1]. D loss — сумма real BCE и fake BCE; G non-saturating использует уже новый D. Один sample каждой стороны; без clipping и batch trainer.',
    'd′=d−η_D[(D(real)−1)real+D(fake)fake]; c′=c−η_D[(D(real)−1)+D(fake)]; q=(D_new(fake)−1)d′; g′=g−η_G qz; b′=b−η_G q', ['Сначала обновляйте только D, используя прежний G.','Для gradient G пересчитайте D(fake) с d′,c′.'],alternating,[
      s('Новый D в шаге G','Начните с нулевых параметров, real=2,z=1 и обоих шагов .1.',{parameters:[0,0,0,0],real:2,z:1,eta_d:.1,eta_g:.1},[.005,.005,.1,0],'Какой d использует G?',['Новый .1','Старый 0','Всегда 1'],'D получает d′=.1,c′=0; fake=0, q=−.05. Поэтому g′=b′=.005.'),
      s('Замороженный G','Положите eta_g=0; проверьте неизменность g,b.',{parameters:[0,0,0,0],real:2,z:3,eta_d:.2,eta_g:0},[0,0,.2,0],'Какая группа остаётся прежней при eta_g=0?',['g,b','d,c','Все параметры'],'Нулевой шаг G сохраняет g,b; D получает d′=.2 за счёт real-примера.'),
      s('Замороженный D','Положите eta_d=0; G всё ещё обучается через ненулевой d.',{parameters:[0,0,2,0],real:1,z:-1,eta_d:0,eta_g:.1},[-.1,.1,2,0],'Означает eta_d=0 нулевой gradient G?',['Нет','Да','Только для z<0'],'D фиксирован при d=2; при fake=0 derivative по fake=−1. Получаем g′=−.1,b′=.1.'),
    ]),
  topic('unit.gan.diversity','Coverage двух фиксированных областей',3,['concept.variance'],
    'two_region_coverage(samples) → [left_count,right_count,coverage,population_variance]. Непустая выборка; области [−1.5,−.5] и [.5,1.5], границы включены. Coverage — доля посещённых областей, не likelihood.',
    'coverage=(1[n_left>0]+1[n_right>0])/2; Var=mean((x−mean(x))²)', ['Считайте попадания в обе области отдельно.','Population variance делится на N, не на N−1.'],diversity,[
      s('Обе modes','Посчитайте coverage samples на двух target modes.',{samples:[-1,1]},[1,1,1,1],'Чему равна coverage?',['1','0.5','2'],'Обе из двух областей посещены: 2/2=1. Variance выборки равна 1.'),
      s('Повторённый sample','Проверьте коллапс в левую область.',{samples:[-1,-1,-1]},[3,0,.5,0],'Что показывает variance=0 здесь?',['Все samples одинаковы','Обе modes покрыты','D всегда прав'],'Все три значения −1; левая область посещена, правая пропущена. Coverage=.5.'),
      s('Правильное среднее, пустые modes','Проверьте samples [−3,3]: mean тот же, что у [−1,1].',{samples:[-3,3]},[0,0,0,9],'Может mean=0 сочетаться с coverage=0?',['Да','Нет','Только при variance=0'],'Оба samples вне target областей. Совпадение среднего не говорит о покрытии modes.'),
    ]),
  topic('unit.gan.variants','WGAN: только значения critic objectives',4,['concept.expectation'],
    'critic_objective(real_scores,fake_scores) → [L_D,L_G], обе выборки непустые, длины могут различаться. Scores произвольные конечные числа. Только арифметика целей; Lipschitz, gradient penalty и conditional trainer здесь не реализованы.',
    'L_D=mean(C(fake))−mean(C(real)); L_G=−mean(C(fake))', ['Critic output не вероятность, sigmoid не нужен.','Это цели для минимизации; знак real-score отрицательный.'],critic,[
      s('Знак цели critic','Найдите обе цели для real scores 3 и 5, fake scores −1 и 1.',{real_scores:[3,5],fake_scores:[-1,1]},[-4,0],'Зачем critic уменьшает L_D?',['Увеличивает real−fake gap','Сжимает всё в [0,1]','Минимизирует BCE'],'Минимизация fake−real увеличивает gap real−fake. Scores не ограничены вероятностным интервалом.'),
      s('Общий сдвиг scores','Прибавьте 10 ко всем scores; сравните L_D и L_G.',{real_scores:[13,15],fake_scores:[9,11]},[-4,-10],'Что сохраняет общий сдвиг critic?',['L_D','Численное значение L_G','Каждый score'],'В L_D общий сдвиг сокращается, L_G сдвигается на константу. Это не меняет gradient по G при постоянном сдвиге.'),
      s('Разные размеры batch','Сравните средние одной real и трёх fake оценок.',{real_scores:[2],fake_scores:[-2,0,2]},[-2,0],'Можно ли называть вычисленный gap Wasserstein distance без ограничений critic?',['Нет','Да','Да, если gap положителен'],'Без 1-Lipschitz условия и оптимизации critic это только значение выбранной цели, не подтверждённое расстояние.'),
    ]),
  topic('unit.diffusion.noise','Alpha cumprod и forward sample',0,['concept.noise-schedule','concept.gaussian'],
    'scheduled_noise(betas,x0,epsilon) → [alpha_bar,xt]. betas — префикс первых t шагов, каждый beta∈(0,1). Пустой префикс разрешён и означает t=0, alpha_bar=1.',
    'ᾱ_t=Πₛ₌₁ᵗ(1−βₛ); x_t=√ᾱ_t x₀+√(1−ᾱ_t)ε', ['Cumprod — произведение, не сумма.','Сумма квадратов двух коэффициентов равна 1.'],forwardNoise,[
      s('Чистое начало','Обработайте пустой schedule prefix при ненулевом epsilon.',{betas:[],x0:2,epsilon:3},[1,2],'Зависит x_t при t=0 от epsilon?',['Нет','Да','Только при epsilon>0'],'При t=0 alpha_bar=1 и коэффициент шума равен 0.'),
      s('Два шага schedule','Посчитайте alpha_bar для двух beta=.5 и xt при epsilon=0.',{betas:[.5,.5],x0:2,epsilon:0},[.25,1],'Какой signal coefficient?',['.5','.25','.75'],'Alpha_bar=.5·.5=.25; коэффициент signal равен √.25=.5.'),
      s('Чистый noise contribution','При x0=0 оставьте только noise.',{betas:[.75],x0:0,epsilon:2},[.25,Math.sqrt(3)],'Чему равна сумма квадратов signal/noise coefficients?',['1','2','alpha_bar'],'Квадраты равны alpha_bar и 1−alpha_bar; их сумма всегда 1.'),
    ]),
  topic('unit.diffusion.training','Epsilon loss и gradient по predictions',1,['concept.loss','concept.backpropagation'],
    'epsilon_mse_gradient(predicted,epsilon) → [mean_loss,d_pred_0,…]. Непустые векторы одинаковой длины. Target — переданный noise epsilon, не x0. Backward по параметрам denoiser — отдельная следующая цепочка.',
    'L=mean((ε̂ᵢ−εᵢ)²); ∂L/∂ε̂ᵢ=2(ε̂ᵢ−εᵢ)/N', ['Фиксируйте t и epsilon во время gradient check.','Mean reduction влияет на каждую производную.'],noiseGradient,[
      s('Loss и каждый gradient','Посчитайте ошибку noise predictions и производные.',{predicted:[1,3],epsilon:[0,1]},[2.5,1,2],'Почему первый gradient равен 1, а не 2?',['Деление на N=2','Это derivative x0','Noise обрезан'],'Для первой ошибки 1 derivative 2·1/2=1. Mean loss=(1+4)/2=2.5.'),
      s('Идеальный noise predictor','Проверьте нулевую loss на новом наборе signed epsilon.',{predicted:[-2,.5,1],epsilon:[-2,.5,1]},[0,0,0,0],'Что является target в epsilon prediction?',['Добавленный epsilon','Чистый x0','Номер t'],'Предсказанный noise сравнивается с тем epsilon, который использовался при создании xt.'),
      s('Дублирование batch','Удвоите batch [1,3] и targets [0,1]; сравните loss и отдельные gradients.',{predicted:[1,3,1,3],epsilon:[0,1,0,1]},[2.5,.5,1,.5,1],'Как меняется mean loss от точного дублирования batch?',['Не меняется','Удваивается','Делится пополам'],'Loss остаётся 2.5; gradient каждого отдельного prediction вдвое меньше из-за нового N=4.'),
    ]),
  topic('unit.diffusion.step','Один scalar DDPM reverse step',2,['unit.diffusion.noise'],
    'ddpm_scalar_step(beta,previous_bar,xt,epsilon,noise) → [mean,posterior_variance,sample]. beta∈[1e−6,1−1e−6], previous_bar∈[1e−6,1]. Нижняя граница исключает округление 1−beta до 1 в f64. previous_bar=1 означает последний reverse шаг t=1→0; тогда дополнительный noise подавлен.',
    'α=1−β; ᾱ=α·ᾱ_prev; μ=(x_t−βε̂/√(1−ᾱ))/√α; v=β(1−ᾱ_prev)/(1−ᾱ); x_prev=μ+√v·noise', ['Posterior variance отличается от beta.','Perfect epsilon даёт x0 на последнем шаге; промежуточный posterior mean обычно не равен x0.'],ddpm,[
      s('Последний шаг','Возьмите xt=.5 и perfect epsilon=−1/√3 для x0=2,alpha=.25; проверьте отсутствие final noise.',{beta:.75,previous_bar:1,xt:.5,epsilon:-1/Math.sqrt(3),noise:4},[2,0,2],'Добавляется ли noise при previous_bar=1?',['Нет','Да, √beta·noise','Да, noise напрямую'],'Согласованный forward: .5·2+√.75·(−1/√3)=.5. Reverse mean=2, variance=0; final noise не добавляется.'),
      s('Промежуточная variance','При beta=.5,previous_bar=.5,xt=1,epsilon=0,noise=0 вычислите mean и variance.',{beta:.5,previous_bar:.5,xt:1,epsilon:0,noise:0},[Math.sqrt(2),1/3,Math.sqrt(2)],'Posterior variance здесь равна beta=.5?',['Нет, равна 1/3','Да','Она равна 0'],'v=.5·.5/.75=1/3; mean=1/√.5=√2.'),
      s('Шум меняет sample','Сохраните прежние параметры, но noise=√3.',{beta:.5,previous_bar:.5,xt:1,epsilon:0,noise:Math.sqrt(3)},[Math.sqrt(2),1/3,Math.sqrt(2)+1],'Как изменится posterior mean при смене noise?',['Не изменится','Вырастет на 1','Умножится на noise'],'Mean определяется xt и prediction; sample дополнительно сдвинется на √(1/3)·√3=1.'),
    ]),
  topic('unit.diffusion.generation','DDIM η=0: один переход, включая skip',3,['unit.diffusion.step'],
    'ddim_deterministic_step(bar,earlier_bar,xt,epsilon) → [estimated_x0,x_earlier]. 0<bar<earlier_bar≤1. Это один переход η=0 с уже известным prediction; новый noise не передаётся. earlier_bar=1 — выход к t=0.',
    'x̂₀=(x_t−√(1−ᾱ_t)ε̂)/√ᾱ_t; x_s=√ᾱ_s x̂₀+√(1−ᾱ_s)ε̂', ['При переходе назад alpha_bar увеличивается.','Для skip нужен earlier_bar выбранного s, а не beta ближайшего шага.'],ddim,[
      s('Переход к clean','Восстановите x0 при нулевом epsilon и сразу перейдите к bar=1.',{bar:.25,earlier_bar:1,xt:1,epsilon:0},[2,2],'Какой sample при earlier_bar=1?',['estimated_x0','xt','epsilon'],'Коэффициент epsilon исчезает, коэффициент estimated_x0 становится 1.'),
      s('Пропущенные шаги','Перейдите от bar=.25 к .64, удерживая epsilon=0.',{bar:.25,earlier_bar:.64,xt:1,epsilon:0},[2,1.6],'Нужен ли случайный noise для этого η=0 шага?',['Нет','Да','Только если skip'],'Формула детерминирована данным xt,prediction и двумя значениями schedule.'),
      s('Сохранить noise direction','Задайте x0=0,epsilon=2 и согласованный xt=√3; перейдите к earlier_bar=.75.',{bar:.25,earlier_bar:.75,xt:Math.sqrt(3),epsilon:2},[0,1],'Почему x_earlier=1?',['√(1−.75)·2=1','Потому что x0=1','Потому что новый noise=1'],'Estimated_x0=0, остаётся старое направление epsilon с меньшим коэффициентом .5.'),
    ]),
  topic('unit.diffusion.condition','Classifier-free guidance по noise vectors',4,['unit.diffusion.training'],
    'classifier_free_guidance(unconditional,conditional,scale) → guided epsilon. Векторы непустые и одной длины, scale∈[0,20]. Это смешивание predictions, не обучение conditioner и не density.',
    'ε_guided=ε_u+s(ε_c−ε_u)', ['s=0 оставляет unconditional; s=1 даёт conditional.','s>1 — экстраполяция, а не усреднение вероятностей.'],guidance,[
      s('Без условия','Реализуйте mixing и проверьте scale=0.',{unconditional:[1,-1],conditional:[3,1],scale:0},[1,-1],'Какой prediction при s=0?',['Unconditional','Conditional','Нулевой вектор'],'Вклад разности умножается на 0, остаётся epsilon_u.'),
      s('Обычное условие','Проверьте другой prediction при scale=1.',{unconditional:[-2,4],conditional:[1,2],scale:1},[1,2],'Какой prediction при s=1?',['Conditional','Среднее','Unconditional'],'epsilon_u+(epsilon_c−epsilon_u)=epsilon_c.'),
      s('Экстраполяция','Используйте scale=2 и найдите выход за диапазон двух predictions.',{unconditional:[1,-1],conditional:[3,1],scale:2},[5,3],'Должны ли guided values лежать между u и c при s=2?',['Нет','Да','Только по первой координате'],'Это экстраполяция: [1,−1]+2·[2,2]=[5,3]. Большой scale не гарантирует качество.'),
    ]),
  topic('unit.gnn.graph','Простой граф: self-loops и степени',0,['concept.matrix'],
    'self_loop_degrees(adjacency) → степени. Adjacency — row-major плоский N×N, N≥1, значения 0/1, симметричен. Установите диагональ в 1 (существующая петля не удваивается). Это явная конвенция простого графа.',
    'Ãᵢⱼ=Aᵢⱼ при i≠j; Ãᵢᵢ=1; dᵢ=Σⱼ Ãᵢⱼ', ['N — квадратный корень длины, форма должна быть точной.','Изолированному узлу добавляется собственное сообщение со степенью 1.'],degrees,[
      s('Два связанных узла','Для одного ребра добавьте self-loops и найдите степени.',{adjacency:[0,1,1,0]},[2,2],'Степень каждого узла после loops?',['2','1','0'],'В строке есть сосед и сам узел: сумма 2.'),
      s('Изолированный узел','Проверьте граф без рёбер на двух узлах.',{adjacency:[0,0,0,0]},[1,1],'Какая степень у изолированного узла после loop?',['1','0','2'],'Единственный входящий вклад — собственная единичная петля.'),
      s('Петля уже существует','Повторите добавление loops к матрице, где они уже есть.',{adjacency:[1,1,1,1]},[2,2],'Нужно ли прибавить ещё 1 к существующей диагонали?',['Нет, по этой конвенции','Да, всегда','Нужно удалить диагональ'],'Операция обеспечивает ровно одну петлю и потому идемпотентна; не путайте её с буквальным A+I для произвольного weighted A.'),
    ]),
  topic('unit.gnn.message','GCN: symmetric aggregation одного feature',1,['unit.gnn.graph'],
    'symmetric_aggregate(adjacency,features) → новый feature каждого узла. Adjacency — простой симметричный бинарный N×N row-major, N≥1; длина features=N. Диагональ устанавливается в 1. Только S·h, без W и activation.',
    'Sᵢⱼ=Ãᵢⱼ/√(dᵢdⱼ); h′ᵢ=ΣⱼSᵢⱼhⱼ', ['Делите на √(d_i*d_j), не на одну степень.','S симметрична, но её строки в нерегулярном графе не обязаны суммироваться в 1.'],aggregation,[
      s('Регулярная пара','Агрегируйте features [2,4] на двух связанных узлах.',{adjacency:[0,1,1,0],features:[2,4]},[3,3],'Почему здесь получается обычное среднее?',['Обе степени равны 2','GCN всегда считает mean','Self-loop исключён'],'Все четыре коэффициента S равны 1/2; каждый выход равен 3.'),
      s('Изоляция','Для двух несвязанных узлов сохраните индивидуальные features.',{adjacency:[0,0,0,0],features:[2,-3]},[2,-3],'Может feature перейти между этими компонентами?',['Нет','Да, через normalization','Да, после loop'],'S=I, поэтому каждый feature остаётся на своём узле.'),
      s('Нерегулярная цепь','На цепи из трёх узлов подайте единицу только в центр; сравните symmetric normalization с mean.',{adjacency:[0,1,0,1,0,1,0,1,0],features:[0,1,0]},[1/Math.sqrt(6),1/3,1/Math.sqrt(6)],'Какой вес сообщения центр→край?',['1/√6','1/2','1/3'],'Степени с loops: [2,3,2]. Между центром и краем коэффициент 1/√(3·2).'),
    ]),
  topic('unit.gnn.train','GCN supervision: masked binary CE по logits',2,['concept.loss','unit.gnn.message'],
    'masked_binary_ce(logits,labels,mask) → [mean_loss,dlogit_0,…]. Непустые равные длины; labels и mask — числа 0/1, mask содержит хотя бы 1. Один binary logit равносилен двум logits [0,z]. Это loss и его локальный backward, не весь двухслойный GCN.',
    'M=Σmᵢ; L=Σmᵢ BCE(zᵢ,yᵢ)/M; dzᵢ=mᵢ(σ(zᵢ)−yᵢ)/M', ['Held-out узлы могут участвовать в message passing, но не в supervised loss.','Нормируйте числом train nodes, а не всех nodes.'],maskedCe,[
      s('Один train node','Вычислите loss и два gradients, когда обучается только первый узел.',{logits:[0,0],labels:[1,0],mask:[1,0]},[Math.log(2),-.5,0],'Какой gradient held-out logit?',['0','−.5','.5'],'Второй mask=0: его label не влияет на эту loss и непосредственный dlogit.'),
      s('Смена held-out label','Измените только label второго узла и сравните результат.',{logits:[0,0],labels:[1,1],mask:[1,0]},[Math.log(2),-.5,0],'Меняется ли train loss при смене held-out label?',['Нет','Да','Только при label=1'],'Mask исключает held-out label из суммы; train loss и gradients сохраняются.'),
      s('Два train node','Подключите оба узла и проверьте mean reduction.',{logits:[0,0],labels:[1,0],mask:[1,1]},[Math.log(2),-.25,.25],'Почему gradient первого узла теперь −.25?',['Train count стал 2','Его label изменился','Sigmoid стал .25'],'Числитель −.5 прежний; деление на два train nodes даёт −.25.'),
    ]),
  topic('unit.gnn.depth','Повторная symmetric smoothing',3,['unit.gnn.message'],
    'repeat_smoothing(adjacency,features,steps) → S^steps·features. Контракт графа как symmetric_aggregate; steps целое в [0,100]. Каждый шаг синхронный, использует весь прежний вектор. Нет обучаемых W и activation.',
    'h⁽ᵏ⁺¹⁾=S h⁽ᵏ⁾; при k=0 возвращается копия h', ['Сначала вычислите новый вектор целиком.','В нерегулярном графе стационарные raw features пропорциональны √degree, не обязательно одинаковы.'],smoothing,[
      s('Два шага на паре','Повторите aggregation дважды и проверьте неподвижность среднего.',{adjacency:[0,1,1,0],features:[2,4],steps:2},[3,3],'Меняет ли второй шаг [3,3] на этой паре?',['Нет','Да, даёт [6,6]','Да, даёт [1.5,1.5]'],'После первого шага оба значения равны 3; регулярное среднее сохраняет эту пару.'),
      s('Нулевая глубина','Проверьте steps=0 без потери исходных features.',{adjacency:[0,1,1,0],features:[-1,5],steps:0},[-1,5],'Чему равен S⁰?',['I','Нулевая матрица','S'],'Нулевая степень — identity; результат новый вектор с исходными значениями.'),
      s('Раздельные компоненты','Сделайте десять шагов на графе из двух изолированных узлов.',{adjacency:[0,0,0,0],features:[1,9],steps:10},[1,9],'Станут ли разные компоненты обязательно одинаковыми?',['Нет','Да, через десять шагов','Да, при self-loops'],'Без ребра нет пути передачи features. Каждая компонента сохраняет собственное состояние.'),
    ]),
  topic('unit.gnn.variants','GraphSAGE: mean и concat до Linear',4,['unit.gnn.message'],
    'graphsage_mean_concat(self_feature,neighbors) → [self_feature,neighbor_mean]. Каждый сосед — scalar feature; пустой список разрешён и по нашей явной конвенции заменяется self_feature. Только mean+concat; GAT и обучаемый Linear отдельно.',
    'h_concat=[h_self, mean(h_neighbors)]; empty mean := h_self', ['Сохраняйте self и mean как два разных канала.','Порядок neighbors не влияет на mean; повтор соседа меняет multiplicity.'],sage,[
      s('Self и соседи','Объедините self=2 с mean соседей [1,3,5].',{self_feature:2,neighbors:[1,3,5]},[2,3],'Почему результат имеет два значения?',['Concat сохраняет self и neighbor mean','Это две пространственные координаты','Это softmax'],'Concat даёт два feature канала [2,3]. Они не объявляются физическими координатами.'),
      s('Перестановка соседей','Переставьте тот же набор neighbors.',{self_feature:2,neighbors:[5,1,3]},[2,3],'Изменится mean после перестановки?',['Нет','Да','Только при отрицательных features'],'Сложение коммутативно; mean и concat сохраняются при перестановке.'),
      s('Нет соседей','Примените оговорённую self convention к изолированному узлу.',{self_feature:-2,neighbors:[]},[-2,-2],'Что берём вместо empty mean в этом упражнении?',['self_feature','NaN','Всегда 0'],'Контракт явно выбирает self_feature=−2. Другие реализации должны отдельно документировать свою empty convention.'),
    ]),
  topic('unit.rl.environment','Discounted return конечной траектории',0,['concept.expectation'],
    'discounted_return(rewards,gamma) → [G]. gamma∈[0,1]; пустая траектория разрешена с G=0. Rewards уже получены; переходы MDP и tail bootstrap здесь не моделируются.',
    'G=Σₜ₌₀ⁿ⁻¹ γᵗ rₜ; обратная рекурсия G←r+γG', ['Первая reward не дисконтируется.','Обход с конца позволяет не возводить gamma в степень.'],returns,[
      s('Три rewards','Вычислите return [1,2,4] при gamma=.5.',{rewards:[1,2,4],gamma:.5},[3],'Какой вклад третьей reward?',['1','2','4'],'Третья reward имеет индекс 2: .5²·4=1; полный return=1+1+1=3.'),
      s('Только ближайшая reward','При gamma=0 сравните немедленную стоимость и далёкую награду.',{rewards:[-1,100],gamma:0},[-1],'Что остаётся при gamma=0?',['Первая reward','Сумма rewards','Последняя reward'],'Все степени gamma начиная с первой равны 0; остаётся reward с t=0.'),
      s('Стоимость пути к награде','Сравните путь [−1,10] при gamma=.9 с немедленным нулём.',{rewards:[-1,10],gamma:.9},[8],'Может первый отрицательный reward вести к лучшему return?',['Да: здесь G=8','Нет','Только при gamma>1'],'Немедленная стоимость −1 компенсируется .9·10=9; итог 8 превышает 0.'),
    ]),
  topic('unit.rl.bellman','Bellman backup: два действия, по два исхода',1,['unit.rl.environment'],
    'two_action_bellman(probabilities,rewards,next_values,terminal,gamma) → [Q_action0,Q_action1,V_new]. Четыре элемента в каждом векторе: исходы action0, затем action1. P∈[0,1], каждая пара суммируется в 1 (1e−12); terminal — 0/1, gamma∈[0,1]. next_values — один frozen snapshot; это один state backup.',
    'Q(a)=Σᵢ Pᵢ(rᵢ+γ(1−terminalᵢ)V_old(nextᵢ)); V_new=max_a Q(a)', ['Сначала взвесьте оба исхода каждого действия.','Terminal outcome не bootstraps даже при ненулевом next_value.'],bellman,[
      s('Ожидание перед max','Для action0 равновероятны rewards 0 и 2; action1 всегда даёт .5. Bootstrap нулевой.',{probabilities:[.5,.5,1,0],rewards:[0,2,.5,0],next_values:[0,0,0,0],terminal:[0,0,0,0],gamma:.9},[1,.5,1],'Что делаем сначала?',['Expectation внутри action, потом max','Max outcome, потом expectation','Среднее всех actions'],'Q0=.5·0+.5·2=1; Q1=.5. Value выбирает максимум 1.'),
      s('Terminal bootstrap','Оба действия ведут в terminal с reward 2 и 1; next_values специально большие.',{probabilities:[1,0,1,0],rewards:[2,0,1,0],next_values:[100,0,200,0],terminal:[1,0,1,0],gamma:.9},[2,1,2],'Влияют большие terminal next_values на backup?',['Нет','Да','Только у выбранного action'],'Для terminal множитель bootstrap нулевой; остаётся только reward.'),
      s('Frozen snapshot','Используйте прежние next_values [2,4] и [1,3] при нулевых rewards.',{probabilities:[.5,.5,.5,.5],rewards:[0,0,0,0],next_values:[2,4,1,3],terminal:[0,0,0,0],gamma:.5},[1.5,1,1.5],'Можно ли подменить часть next_values уже обновлёнными при synchronous sweep?',['Нет','Да, без изменения алгоритма','Да, для большего action'],'Все backups synchronous sweep читают один старый snapshot. Подстановка новых значений меняет алгоритм на асинхронный.'),
    ]),
  topic('unit.rl.q-learning','Q update: termination и truncation',2,['unit.rl.bellman'],
    'q_transition_update(old,reward,next_max,gamma,eta,terminated,truncated) → [target,new_Q]. gamma,eta∈[0,1]; flags — числа 0/1. Administrative truncation сохраняет bootstrap; если terminated=1, bootstrap отключается независимо от truncated.',
    'target=r+γ(1−terminated)max Q_next; Q_new=Q_old+η(target−Q_old)', ['Не объединяйте terminated и truncated через OR для bootstrap.','next_max должен соответствовать реальному final observation, не observation после auto-reset.'],qUpdate,[
      s('Обычный переход','Вычислите TD target и новый Q.',{old:2,reward:1,next_max:4,gamma:.5,eta:.25,terminated:0,truncated:0},[3,2.25],'Чему равен TD error?',['1','3','−1'],'Target=1+.5·4=3; error=3−2=1; update=.25.'),
      s('MDP terminal','Измените тот же переход на terminated=1.',{old:2,reward:1,next_max:4,gamma:.5,eta:.25,terminated:1,truncated:0},[1,1.75],'Какой terminal target?',['1','3','4'],'MDP terminal не имеет будущей ценности, target равен reward=1.'),
      s('Лимит времени','Вместо termination отметьте только truncated=1.',{old:2,reward:1,next_max:4,gamma:.5,eta:.25,terminated:0,truncated:1},[3,2.25],'Отключает ли административный time limit bootstrap?',['Нет','Да','Только при gamma=.5'],'Truncation завершает сбор траектории, но не MDP: target остаётся 1+.5·4=3.'),
    ]),
  topic('unit.rl.policy','Точный bandit gradient и REINFORCE variance',3,['concept.expectation','concept.derivative'],
    'bandit_policy_gradient(theta,left_reward,right_reward,baseline) → [p_right,J,dJ,E_estimate,Var_estimate]. p_right=sigmoid(theta). Baseline общий для обоих действий, независимый от action; exact enumeration двух исходов, без случайного sampling.',
    'J=(1−p)r_L+pr_R; dJ=p(1−p)(r_R−r_L); g_L=(r_L−b)(−p); g_R=(r_R−b)(1−p)', ['У left derivative log probability равна −p; у right — 1−p.','Общий baseline сохраняет expected gradient, но не обязательно уменьшает variance.'],policy,[
      s('Разные rewards','Для равновероятных действий вычислите J, точный gradient и variance estimator.',{theta:0,left_reward:0,right_reward:2,baseline:0},[.5,1,.5,.5,.25],'В какую сторону gradient ascent двигает theta?',['В положительную','В отрицательную','Не двигает'],'Right reward выше; dJ=.5. Рост theta увеличивает вероятность right.'),
      s('Полезный baseline','Сохраните rewards, но выберите baseline=1.',{theta:0,left_reward:0,right_reward:2,baseline:1},[.5,1,.5,.5,0],'Что поменял baseline=1 в этом примере?',['Variance стала 0, expectation прежнее','Gradient стал 0','J стал 0'],'Оба estimator исхода равны .5: variance нулевая, expected gradient остаётся .5.'),
      s('Равные rewards','Оба действия дают 2, baseline=0; различите expected gradient и variance.',{theta:0,left_reward:2,right_reward:2,baseline:0},[.5,2,0,0,1],'Обязан ли отдельный REINFORCE sample быть 0 при равных rewards?',['Нет, здесь ±1','Да','Только при theta=0'],'Точный gradient=0, но estimates −1 и +1 компенсируются лишь в expectation; variance=1.'),
    ]),
  topic('unit.rl.families','PPO: clipped objective одного sample',4,['unit.rl.policy'],
    'ppo_clipped_term(ratio,advantage,epsilon) → [objective]. ratio=pi_new(a)/pi_old(a)>0, epsilon∈[0,1). Это член цели для максимизации с уже frozen old policy и advantage; полный PPO/DQN/actor-critic trainer не реализован.',
    'L=min(rA,clip(r,1−ε,1+ε)A)', ['Сначала умножьте обе ветви на signed advantage, затем min.','При отрицательном A направление ограничения отличается от положительного.'],ppo,[
      s('Положительный advantage','При ratio=1.5,epsilon=.2 и A=2 вычислите обе ветви и min.',{ratio:1.5,advantage:2,epsilon:.2},[2.4],'Какая ветвь выбрана?',['Clipped 1.2·2','Unclipped 1.5·2','Среднее ветвей'],'min(3,2.4)=2.4: слишком большое увеличение вероятности ограничивает улучшение surrogate.'),
      s('Отрицательный advantage','Повторите тот же ratio при A=−2.',{ratio:1.5,advantage:-2,epsilon:.2},[-3],'Какая ветвь выбрана теперь?',['Unclipped −3','Clipped −2.4','Ноль'],'После умножения на отрицательный A порядок меняется: min(−3,−2.4)=−3.'),
      s('Сильное уменьшение вероятности','Возьмите ratio=.5, A=−2: проверьте нижнюю границу clip.',{ratio:.5,advantage:-2,epsilon:.2},[-1.6],'Почему выбран −1.6, а не −1?',['Min после signed умножения','Нужно всегда брать clipped ratio','Advantage всегда положителен'],'Unclipped=.5·(−2)=−1, clipped=.8·(−2)=−1.6. Выбирается меньшее −1.6.'),
    ]),
];
