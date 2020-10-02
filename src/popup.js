const responseTextToJson = (responseText) => {
    return JSON.parse(responseText.replace("while(1);", ""));
};

const breakAllSpace = (text) => {
    return text.replace(/[\s\r\n]/g, "");
};

const getXnApiToken = (lectures) => {
    return new Promise((resolve, reject) => {
        chrome.cookies.get({
            url: "https://lms.ync.ac.kr",
            name: "xn_api_token"
        }, (cookie) => {
            if (!cookie) {
                $('#area > input[type=button]#init_btn').css('display', 'block');
                $('#loading_splash').css('display', 'none');
                reject();
            } else {
                resolve(cookie.value);
            }
        });
    });
};

const lectureUrlBuilder = (course_id, section_id, unit_id, component_id, user_info) => {
    return "https://lms.ync.ac.kr/learningx/coursebuilder/course/" + course_id + "/learn/" + section_id + "/unit/" + unit_id + "/view?user_id=" + user_info.id + "&user_login=" + user_info.no + "&user_name=" + user_info.name + "&user_email=" + user_info.email + "&role=1&locale=ko&mode=default&component_id=" + component_id;
};

const dateBuilder = (date) => {
    if (!date) {
        return '-';
    }
    date = new Date(date);
    return date.getFullYear() + '/' + (date.getMonth() + 1) + '/' + date.getDate() + ' ' + date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds();
};

const extractLectures = () => {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: "https://lms.ync.ac.kr/api/v1/users/self/favorites/courses?include[]=term&exclude[]=enrollments",
            type: "GET",
            contentType: "application/json",
            complete: (lecture_response) => {
                const json_data = responseTextToJson(lecture_response.responseText);
                const lectures = [];

                $(json_data).each((index, item) => {
                    lectures.push({
                        id: item.id,
                        name: item.name
                    });
                });
                resolve(lectures);
            }
        });
    });
};

const getUserInfo = () => {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: "https://lms.ync.ac.kr/profile/settings",
            type: "GET",
            complete: (profile_response) => {
                const profile_data = breakAllSpace(profile_response.responseText);

                if (profile_data.indexOf("http://ssoauth.ync.ac.kr:80/login.html") !== -1) {
                    chrome.tabs.create({
                        url: 'https://yclass.ync.ac.kr/xn-sso/login.php'
                    });
                }
                const user_name_match = profile_data.match(/<title>사용자설정:(.*)\((.*)\)<\/title>/);
                const user_name = user_name_match[1] + '(' + encodeURIComponent(user_name_match[2] + ' )');

                // const user_email = encodeURIComponent(profile_data.match(/<pclass=\"pathemail_channelcontact_channel_pathellipsis\">(.*)<\/>/)[1]);
                const user_email = encodeURIComponent(profile_data.match(/"primary_email":"(.*)","log/)[1]);

                const option_data = profile_data.match(/id="profile_pseudonym_id"><optionvalue="(\d*)">(\d*)<\/option><\/select>/);

                resolve({
                    id: option_data[1],
                    no: option_data[2],
                    name: user_name,
                    email: user_email
                })
            }
        });
    });
};

const extractLearnStatus = (course_id, user_info, xnApiToken) => {
    console.log("https://lms.ync.ac.kr/learningx/api/v1/courses/" + course_id + "/sections/learnstatus_db?" +
        "user_id=" + user_info.id + "&" +
        "user_login=" + user_info.no + "&" +
        "role=1");
    return new Promise((resolve, reject) => {
        $.ajax({
            url: "https://lms.ync.ac.kr/learningx/api/v1/courses/" + course_id + "/sections/learnstatus_db?" +
                "user_id=" + user_info.id + "&" +
                "user_login=" + user_info.no + "&" +
                "role=1",
            type: "GET",
            contentType: "application/json",
            headers: {
                "Authorization": "Bearer " + xnApiToken
            },
            complete: (assignment_response) => {
                const sections = responseTextToJson(assignment_response.responseText)["sections"];
                const assignments = [];

                $(sections).each((index, section) => {
                    console.log(section);
                    const unlock_at = section["unlock_at"];
                    const due_at = section["due_at"];
                    $(section["subsections"]).each((index, subsection) => {
                        const current_at = new Date();
                        $(subsection["units"]).each((index, unit) => {
                            $(unit["components"]).each((index, component) => {

                                if ((!unlock_at && !due_at && !component["unlock_at"] && !component["due_at"]) ||
                                    (unlock_at &&
                                        (new Date(unlock_at) <= current_at)) ||
                                    (component["unlock_at"] &&
                                        (new Date(component["unlock_at"]) <= current_at))) {

                                    const final_unlock_at = unlock_at ? unlock_at : component["unlock_at"];

                                    const final_due_at = (() => {
                                        let ret;

                                        if (!due_at) {
                                            ret = component["due_at"];
                                        } else if (!component["due_at"]) {
                                            ret = due_at;
                                        } else {
                                            if (new Date(due_at) > new Date(component["due_at"])) {
                                                ret = component["due_at"];
                                            } else {
                                                ret = due_at;
                                            }
                                        }

                                        return ret;
                                    })();

                                    if (!component["completed"]) {
                                        console.log(component);
                                        assignments.push({
                                            component_title: component["title"],
                                            component_id: component["component_id"],
                                            section_id: component["section_id"],
                                            unit_id: component["unit_id"],
                                            unlock_at: dateBuilder(final_unlock_at),
                                            due_at: dateBuilder(final_due_at)
                                        });
                                    }
                                }
                            });
                        });
                    });
                });
                resolve(assignments);
            }
        });
    });
};

const get_lectures = () => {
    $('#init_btn').css('display', 'none');
    $('#get_list_btn').css('display', 'none');
    $('#download_btn').css('display', 'none');
    $('#loading_splash').css('display', 'flex');
    chrome.tabs.executeScript({
        file: "/vendor/jquery-3.5.1.min.js"
    }, () => {
        getUserInfo()
            .then(user_info => {
                extractLectures()
                    .then(lectures => {
                        getXnApiToken(lectures)
                            .then((xnApiToken) => {
                                const lecturesAssignments = [];
                                let lecture_cnt = 0;
                                (() => {
                                    return lectures.reduce(async (promise, lecture) => {
                                        await promise;
                                        return extractLearnStatus(lecture.id, user_info, xnApiToken)
                                            .then((assignments) => {
                                                const lectureData = {
                                                    name: lecture.name,
                                                    assignments: []
                                                };
                                                assignments.forEach((assignment) => {
                                                    assignment["url"] = lectureUrlBuilder(lecture.id, assignment.section_id, assignment.unit_id, assignment.component_id, user_info);
                                                    lectureData.assignments.push(assignment);
                                                });
                                                lecturesAssignments.push(lectureData);
                                                console.log('push');
                                                console.log(lectureData);
                                                lecture_cnt += 1.0;
                                                const progress = lecture_cnt / lectures.length * 100.0;
                                                console.log(lecture_cnt + '/' + lectures.length);
                                                console.log(progress);
                                                $('#loading_splash > .progress-bar')
                                                    .attr('aria-valuenow', progress)
                                                    .css('width', progress + '%')
                                                    .text(Math.round(progress) + '%');
                                            });
                                    }, Promise.resolve());
                                })()
                                    .then(() => {
                                        console.log(lecturesAssignments);
                                        generate_lecture_list(lecturesAssignments);
                                    });
                            });
                    });
            })
    });
};

const DOMContentLoad = () => {
    /*
    DOM 초기화 관련
     */
    $('#area')
        .html(`
    <input type="button" class="btn btn-primary" id="init_btn" value="초기 설정"
           style="display:none; width: 70%; height: 35%; font-size: 1rem; font-weight: bold;">
    <input type="button" class="btn btn-primary" id="get_list_btn" value="목록 가져오기">
    <input type="button" class="btn btn-info d-none mt-3" id="download_btn" value="영상 다운로드">
    <div class="container">
        <!--        <img src="loading.gif" id="loading_splash" style="display: none;">-->
        <div class="progress" style="height: 1.75rem; display: none" id="loading_splash">
            <div class="progress-bar progress-bar-striped active progress-bar-animated" role="progressbar"
                 aria-valuenow="0"
                 aria-valuemin="0" aria-valuemax="100" style="width: 0; font-weight: bold;"></div>
        </div>
    </div>
        `)
        .css('width', '200px')
        .css('height', '150px');


    $('#lms_logo').on('click', DOMContentLoad);

    $('#area > #init_btn').on('click', () => {
        extractLectures()
            .then(lectures => {
                chrome.tabs.create({
                    'url': 'https://lms.ync.ac.kr/courses/' + lectures[0].id + '/external_tools/5'
                });
            });
    });

    chrome.tabs.query({
        active: true, currentWindow: true
    }, function (tabs) {
        chrome.tabs.executeScript(tabs[0].id, {
            code: `                
                async function getData() {          
                    if(document.getElementById('tool_content')) {
                        var frame = document.getElementById('tool_content').contentWindow.document.getElementsByClassName('xnvc-video-frame');
                    } else {
                        var frame = document.getElementsByClassName('xnvc-video-frame');
                    }
                    console.log(frame);
                    return Promise.all(
                        Array.from(frame).map(r => {
                            return Promise.resolve({
                                    src: r.src,
                                    title: r.parentElement.parentElement.parentElement.parentElement.parentElement.getElementsByClassName('xnct-title')[0].innerText
                            });
                        })
                    );
                }
                getData()
                .then(d=>{
                    chrome.runtime.sendMessage({ videos: d });
                });
                `
        }, result => {
            if (!result) {
                get_lectures();
            }
        });
    });

    chrome.runtime.onMessage.addListener(function (msg) {
        console.log(msg);
        if (msg.videos && msg.videos.length !== 0) {
            const videos = msg.videos;

            const download_list_group = document.createElement('div');
            $(download_list_group)
                .addClass('list-group')
                .css('height', '100%')
                .css('width', '100%')
                .css('overflow-y', 'scroll');

            $('#download_btn')
                .removeClass('d-none')
                .on('click', () => {
                    for (let i = 0; i < videos.length; ++i) {
                        const src = videos[i].src;
                        const title = videos[i].title;
                        const lecture_code = /https:\/\/lms.ync.ac.kr\/learningx\/coursebuilder\/view\/contents\/([a-z0-9]*)?/.exec(src)[1];

                        $.ajax({
                            url: "https://ymooc.ync.ac.kr/viewer/ssplayer/uniplayer_support/content.php?content_id=" + lecture_code,
                            type: "GET",
                            complete: (data) => {
                                const xml = new DOMParser().parseFromString(data.responseText, "text/xml");

                                const content_playing_info = xml.getElementsByTagName('content_playing_info')[0];
                                const service_root = xml.getElementsByTagName('service_root')[0];

                                const content_type = content_playing_info.getElementsByTagName('content_type')[0].childNodes[0].nodeValue;

                                let mediaSrc = '';
                                switch (content_type) {
                                    case 'video1':
                                        mediaSrc = content_playing_info.querySelector('main_media > desktop > html5 > media_uri').childNodes[0].nodeValue;
                                        break;
                                    case 'upf':
                                        const main_media = content_playing_info.querySelector('story_list > story > main_media_list > main_media').childNodes[0].nodeValue
                                        const media_uri = service_root.querySelector('media > media_uri[method="progressive"]').childNodes[0].nodeValue;
                                        mediaSrc = media_uri.replace('[MEDIA_FILE]', main_media);
                                        break;
                                }

                                const download_list_group_item = document.createElement('a');
                                $(download_list_group_item)
                                    .addClass(['list-group-item', 'list-group-item-action'])
                                    .attr('href', '#')
                                    .text(title)
                                    .on('click', () => {
                                        chrome.tabs.create({
                                            url: mediaSrc
                                        });
                                    });
                                download_list_group.appendChild(download_list_group_item);
                            }
                        });
                    }
                    $('#area')
                        .html(download_list_group)
                        .css('width', '250px')
                        .css('height', '200px');
                });
        } else {
            get_lectures();
        }
    });

    $('#area > #get_list_btn').on('click', get_lectures);

    $('#developedBtn').on('click', () => {
        chrome.tabs.create({
            'url': 'https://jupiterflow.com'
        });
    });
};

document.addEventListener('DOMContentLoaded', DOMContentLoad);

const generate_lecture_list = (lecturesAssignments) => {
    let result_html_markup = `
<!doctype html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" integrity="sha384-JcKb8q3iqJ61gNV9KGb8thSsNjpSL0n8PARn9HuZOnIxN0hoP+VmmDGMN5t9UJ0Z" crossorigin="anonymous">
    <title>YNC LMS Supporter</title>
    <style>
    .table > tbody > tr > td {
        vertical-align: middle;
     }
</style>
</head>
<body>
<div class="container"><div class="row mt-3">
                                `;
    for (const lecture of lecturesAssignments) {
        if (lecture.assignments.length !== 0) {

            result_html_markup += `
                                    <h1 class="mt-2">${lecture.name}</h1>
                                    <table class="table table-striped table-hover table-sm"><thead><tr><th style="width:50%">이름</th><th style="width:20%;">시작 시간</th><th style="width:20%;">마감 시간</th><th style="width: 10%">LMS</th></tr></thead><tbody>
                                    `;

            $(lecture.assignments).each((index, assignment) => {
                result_html_markup += `
                                        <tr><td>${assignment.component_title}</td><td>${assignment.unlock_at}</td><td>${assignment.due_at}</td><td><a href="${assignment.url}"target="_blank" class="btn btn-primary">바로가기</a></td></tr>
                                        `;
            });

            result_html_markup += '</tbody></table>';
        }
    }
    result_html_markup += '</div></div></body></html>';
    const url = "data:text/html," + encodeURIComponent(result_html_markup);
    chrome.tabs.create({'url': url});
}