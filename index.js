const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const _ = require('lodash');
const unified = require('unified');
const visit = require('unist-util-visit');
const parse = require('rehype-parse');
const toMdast = require('hast-util-to-mdast');
const stringify = require('remark-stringify');

const leetcodeConfig = require(path.resolve(process.cwd(), './.leetcode'));
const dist = leetcodeConfig.dist || './docs';
const baseUrl = 'https://leetcode-cn.com';
const count = 0; // 0

const getLoginFormData = (account, csrf) => {
	const formData = new FormData();
	formData.append('csrfmiddlewaretoken', csrf);
	formData.append('login', account.username);
	formData.append('password', account.password);
	formData.append('next', '/problemset/all/');

	return formData;
};

const getCsrf = async () => {
	const response = await axios.get(`${baseUrl}/api/ensure_csrf`);
	const cookie = response.headers['set-cookie'][0];
	const csrf = cookie.split(';')[0].split('=')[1];

	return csrf;
};

const getSession = async account => {
	const loginUrl = `${baseUrl}/accounts/login/`;
	const csrf = await getCsrf();
	const formData = getLoginFormData(account, csrf);

	const response = await axios.post(loginUrl, formData, {
		headers: {
			'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
			Referer: loginUrl,
			Cookie: `csrftoken=${csrf}`,
		},
		maxRedirects: 0,
		validateStatus: status => status === 302,
	});

	const session = response.headers['set-cookie'].map(item => item.split(';')[0]).join(';');

	return session;
};

const getProgress = async cookie => {
	const response = await axios.get(`${baseUrl}/api/progress/all`, {
		headers: {
			Cookie: cookie,
		},
	});

	return response.data;
};

const getProblems = async cookie => {
	const response = await axios.get(`${baseUrl}/api/problems/all`, {
		headers: {
			Cookie: cookie,
		},
	});

	return response.data;
};

const getTags = async () => {
	const response = await axios.get(`${baseUrl}/problems/api/tags`);

	return response.data;
};

const getFavorites = async (cookie = '') => {
	const response = await axios.get(`${baseUrl}/problems/api/favorites`, {
		headers: {
			Cookie: cookie,
		},
	});

	return response.data;
};

const getGlobalData = async cookie => {
	const query = `
        query globalData {
            feature {
                questionTranslation
                subscription
                signUp
                discuss
                mockInterview
                contest
                store
                book
                chinaProblemDiscuss
                socialProviders
                studentFooter
                cnJobs
                __typename
            }
            userStatus {
                isSignedIn
                isAdmin
                isStaff
                isSuperuser
                isTranslator
                isPremium
                isVerified
                isPhoneVerified
                isWechatVerified
                checkedInToday
                username
                realName
                userSlug
                groups
                jobsCompany {
                    nameSlug
                    logo
                    description
                    name
                    legalName
                    isVerified
                    permissions {
                        canInviteUsers
                        canInviteAllSite
                        leftInviteTimes
                        maxVisibleExploredUser
                        __typename
                    }
                    __typename
                }
                avatar
                optedIn
                requestRegion
                region
                activeSessionId
                permissions
                notificationStatus {
                    lastModified
                    numUnread
                    __typename
                }
                completedFeatureGuides
                useTranslation
                __typename
            }
            siteRegion
            chinaHost
            websocketUrl
        }
    `;

	const response = await axios.post(`${baseUrl}/graphql`, JSON.stringify({ query }), {
		headers: {
			'Content-Type': 'application/json',
			Cookie: cookie,
		},
	});

	return response.data;
};

const getQuestionsStatuses = async cookie => {
	const query = `
        query allQuestionsStatuses {
            allQuestions {
                ...questionStatusFields
                __typename
            }
        }
        fragment questionStatusFields on QuestionNode {
            questionId
            status
            __typename
        }
    `;

	const response = await axios.post(`${baseUrl}/graphql`, JSON.stringify({ query }), {
		headers: {
			'Content-Type': 'application/json',
			Cookie: cookie,
		},
	});

	return response.data;
};

const getQuestionTranslation = async cookie => {
	const query = `
        query getQuestionTranslation($lang: String) {
            translations: allAppliedQuestionTranslations(lang: $lang) {
                title
                questionId
                __typename
            }
        }
    `;

	const response = await axios.post(`${baseUrl}/graphql`, JSON.stringify({ query }), {
		headers: {
			'Content-Type': 'application/json',
			Cookie: cookie,
		},
	});

	return response.data;
};

const getQuestionData = async (cookie, titleSlug) => {
	const query = `
        query {
            question(titleSlug: "${titleSlug}") {
                questionId
                questionFrontendId
                boundTopicId
                title
                titleSlug
                content
                translatedTitle
                translatedContent
                isPaidOnly
                difficulty
                likes
                dislikes
                isLiked
                similarQuestions
                contributors {
                    username
                    profileUrl
                    avatarUrl
                    __typename
                }
                langToValidPlayground
                topicTags {
                    name
                    slug
                    translatedName
                    __typename
                }
                companyTagStats
                codeSnippets {
                    lang
                    langSlug
                    code
                    __typename
                }
                stats
                hints
                solution {
                    id
                    canSeeDetail
                    __typename
                }
                status
                sampleTestCase
                metaData
                judgerAvailable
                judgeType
                mysqlSchemas
                enableRunCode
                enableTestMode
                envInfo
                __typename
            }
        }
    `;

	const response = await axios.post(`${baseUrl}/graphql`, JSON.stringify({ query }), {
		headers: {
			'Content-Type': 'application/json',
			Cookie: cookie,
		},
	});

	return response.data;
};

const getLastSubmission = async (cookie, qid, lang = 'javascript') => {
	const response = await axios.get(`${baseUrl}/submissions/latest`, {
		params: {
			qid,
			lang,
		},
		headers: {
			Cookie: cookie,
		},
	});

	return response.data;
};

const getSubmissionCalendar = async username => {
	const response = await axios.get(`${baseUrl}/api/user_submission_calendar/${username}`);

	return JSON.parse(response.data);
};

const getLeetcodeData = async leetcodeConfig => {
	const cookie = await getSession(leetcodeConfig);
	const problems = await getProblems(cookie);
	const submissions = await getSubmissionCalendar(problems.user_name);

	const data = {};
	data.user = _.pick(problems, ['user_name']);
	data.progress = _.pick(problems, [
		'num_solved',
		'num_total',
		'ac_easy',
		'ac_medium',
		'ac_hard',
	]);
	data.problems = problems.stat_status_pairs.reduce((acc, curr) => {
		if (curr.status === 'ac') {
			acc.push(curr.stat);
		}
		return acc;
	}, []);

	data.problems = data.problems.slice(-count);

	const questionsAndLastSubmissions = await Promise.all(
		data.problems.map(problem => {
			return Promise.all([
				getQuestionData(cookie, problem.question__title_slug),
				getLastSubmission(cookie, problem.question_id),
			]);
		})
	);
	data.problems.forEach((problem, index) => {
		data.problems[index].question = questionsAndLastSubmissions[index][0].data.question;
		data.problems[index].lastSubmission = questionsAndLastSubmissions[index][1];
	});

	data.problems.sort((p1, p2) => p1.question_id - p2.question_id);

	data.submissions = submissions;

	return data;
};

const transformContent = (source) => {
  const hast = unified().use(parse).parse(source);

  // TODO 格式化
  visit(hast, node => {
    if (node.tagName === 'pre') {
      node.tagName = 'p';
    }
  });

  const mdast = toMdast(hast);
  const output = unified().use(stringify).stringify(mdast);

  return output;
}

const generateMarkdown = (problems = []) => {
	const dir = path.resolve(process.cwd(), dist);

	fs.stat(dir, (err, stats) => {
		if (err || !stats.isDirectory(dir)) {
			fs.mkdirSync(dir);
		}

		problems.map(problem => {
			generateFile(problem);
		});
	});

	function generateFile(problem) {
		const id = problem.question_id;
		const title = problem.question__title;
		const titleSlug = problem.question__title_slug;
		// const { difficulty } = problem.question;

    let md = `---\nid: ${titleSlug}\ntitle: ${id}. ${title}\n---\n\n`;
    md +=  `# ${title}\n\n`;
    md += `${transformContent(problem.question.translatedContent)}\n\n`;
		md += `\n\`\`\`javascript\n${problem.lastSubmission.code}\n\`\`\``;

		fs.writeFile(`${dir}/${titleSlug}.md`, md, err => {
			if (err) {
				console.log(err);
			} else {
				// console.log(`${id}.${titleSlug}`);
			}
		});
	}
};

const generateSummary = (data = {}) => {
	const file = path.resolve(process.cwd(), dist, './guide.json');
	const summary = Object.assign({}, data, {
		problems: data.problems.map(problem => problem.question__title_slug),
	});

	fs.writeFile(file, JSON.stringify(summary, null, '  '), err => {
		if (err) {
			console.log(err);
		} else {
			console.log(`${summary.problems.length} solutions\n`);
		}
	});
};

module.exports = function() {
	const start = Date.now();

	getLeetcodeData(leetcodeConfig)
		.then(data => {
			generateSummary(data);
			generateMarkdown(data.problems);

			console.log(`${Date.now() - start} ms`);
		})
		.catch(console.log);
};
